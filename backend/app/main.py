from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from . import models, schemas, graph_engine, ai_suggestions
from .database import init_db, get_db

app = FastAPI(title="TaskFlow Pro API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    init_db()


def _load_graph(db: Session):
    tasks = db.query(models.Task).all()
    deps = db.query(models.TaskDependency).all()
    task_ids = [t.id for t in tasks]
    edges = [(d.from_task_id, d.to_task_id) for d in deps]
    forward, reverse = graph_engine.build_adjacency(task_ids, edges)
    return tasks, deps, task_ids, edges, forward, reverse


def _task_to_out(task: models.Task, status: str, reverse: dict = None) -> schemas.TaskOut:
    prereqs = sorted(reverse.get(task.id, [])) if reverse else []
    return schemas.TaskOut(
        id=task.id, title=task.title, description=task.description,
        column=task.column, start_date=task.start_date,
        duration_days=task.duration_days, status=status, prerequisite_ids=prereqs,
    )


@app.post("/tasks", response_model=schemas.TaskOut)
def create_task(payload: schemas.TaskCreate, db: Session = Depends(get_db)):
    if db.query(models.Task).filter_by(id=payload.id).first():
        raise HTTPException(status_code=400, detail="Task id already exists")
    task = models.Task(**payload.dict())
    db.add(task)
    db.commit()
    return _task_to_out(task, "Ready")


@app.get("/board-state", response_model=list[schemas.TaskOut])
def board_state(db: Session = Depends(get_db)):
    tasks, _, task_ids, _, _, reverse = _load_graph(db)
    status_by_id = {t.id: t.column for t in tasks}
    blocked_status = graph_engine.compute_blocked_status(task_ids, reverse, status_by_id)
    return [_task_to_out(t, blocked_status[t.id], reverse) for t in tasks]


@app.put("/tasks/{task_id}", response_model=schemas.TaskOut)
def update_task(task_id: str, payload: schemas.TaskUpdate, db: Session = Depends(get_db)):
    task = db.query(models.Task).filter_by(id=task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    for field, value in payload.dict(exclude_unset=True).items():
        setattr(task, field, value)
    db.commit()
    tasks, _, task_ids, _, _, reverse = _load_graph(db)
    status_by_id = {t.id: t.column for t in tasks}
    blocked_status = graph_engine.compute_blocked_status(task_ids, reverse, status_by_id)
    return _task_to_out(task, blocked_status[task.id], reverse)


@app.post("/dependencies", response_model=schemas.DependencyOut)
def create_dependency(payload: schemas.DependencyCreate, db: Session = Depends(get_db)):
    for tid in (payload.from_task_id, payload.to_task_id):
        if not db.query(models.Task).filter_by(id=tid).first():
            raise HTTPException(status_code=404, detail=f"Task {tid} not found")
    _, _, _, _, forward, _ = _load_graph(db)
    if graph_engine.creates_cycle(forward, payload.from_task_id, payload.to_task_id):
        raise HTTPException(
            status_code=409,
            detail=f"Rejected: adding {payload.from_task_id} -> {payload.to_task_id} would create a cycle. The dependency graph is unchanged.",
        )
    dep = models.TaskDependency(from_task_id=payload.from_task_id, to_task_id=payload.to_task_id)
    db.add(dep)
    db.commit()
    db.refresh(dep)
    return dep


@app.post("/tasks/{task_id}/shift", response_model=schemas.ShiftResponse)
def shift_task(task_id: str, payload: schemas.ShiftRequest, db: Session = Depends(get_db)):
    _, _, task_ids, _, forward, reverse = _load_graph(db)
    if task_id not in task_ids:
        raise HTTPException(status_code=404, detail="Task not found")
    affected = graph_engine.propagate_shift(task_ids, forward, reverse, task_id, payload.delta_days)
    return schemas.ShiftResponse(affected_tasks=affected)


@app.get("/tasks/{task_id}/suggest-dependencies")
def suggest_dependencies_for_task(task_id: str, db: Session = Depends(get_db)):
    task = db.query(models.Task).filter_by(id=task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    other_tasks = db.query(models.Task).filter(models.Task.id != task_id).all()
    new_task_dict = {"id": task.id, "title": task.title, "description": task.description}
    existing_dicts = [{"id": t.id, "title": t.title, "description": t.description} for t in other_tasks]
    return {"suggestions": ai_suggestions.suggest_dependencies(new_task_dict, existing_dicts)}


@app.get("/tasks/{task_id}/breakdown", response_model=schemas.TaskBreakdownResponse)
def breakdown_task(task_id: str, db: Session = Depends(get_db)):
    task = db.query(models.Task).filter_by(id=task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    _, _, _, _, forward, reverse = _load_graph(db)
    all_tasks = db.query(models.Task).all()
    by_id = {t.id: t for t in all_tasks}
    context = {
        "duration_days": task.duration_days,
        "prerequisite_titles": [by_id[pid].title for pid in sorted(reverse.get(task_id, [])) if pid in by_id],
        "dependent_titles": [by_id[did].title for did in sorted(forward.get(task_id, [])) if did in by_id],
    }
    return ai_suggestions.breakdown_task(
        {"id": task.id, "title": task.title, "description": task.description}, context
    )


@app.post("/tasks/{task_id}/what-if", response_model=schemas.WhatIfResponse)
def what_if(task_id: str, payload: schemas.ShiftRequest, db: Session = Depends(get_db)):
    task = db.query(models.Task).filter_by(id=task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    tasks, _, task_ids, _, forward, reverse = _load_graph(db)
    affected = graph_engine.propagate_shift(task_ids, forward, reverse, task_id, payload.delta_days)
    titles = {t.id: t.title for t in tasks}
    path, total = graph_engine.critical_path(task_ids, forward, {t.id: t.duration_days for t in tasks})
    critical_set = set(path)
    affected_critical = [titles[i] for i in affected if i in critical_set]
    return {
        "delta_days": payload.delta_days,
        "critical_path_duration": total,
        "explanation": {
            "headline": f"Moving '{task.title}' by {payload.delta_days:+d} day(s) affects {len(affected)} task(s).",
            "recommendation": (
                "Review the affected critical-path tasks first."
                if affected_critical
                else "No critical-path task is directly affected."
            ),
            "affected_tasks": [titles[i] for i in affected if i != task_id],
            "critical_affected": affected_critical,
        },
    }


@app.get("/risk-analysis", response_model=schemas.RiskAnalysisResponse)
def get_risk_analysis(db: Session = Depends(get_db)):
    tasks, _, task_ids, _, forward, reverse = _load_graph(db)
    status_by_id = {t.id: t.column for t in tasks}
    blocked_status = graph_engine.compute_blocked_status(task_ids, reverse, status_by_id)
    path, total = graph_engine.critical_path(task_ids, forward, {t.id: t.duration_days for t in tasks})
    critical_set = set(path)
    snapshot = {
        "tasks": [
            {
                "id": t.id,
                "title": t.title,
                "status": blocked_status[t.id],
                "column": t.column,
                "duration_days": t.duration_days,
                "prerequisite_ids": sorted(reverse.get(t.id, [])),
                "dependent_ids": sorted(forward.get(t.id, [])),
                "is_critical": t.id in critical_set,
            }
            for t in tasks
        ],
        "critical_path": path,
        "total_duration": total,
        "forward": {tid: sorted(forward.get(tid, [])) for tid in task_ids},
    }
    return ai_suggestions.analyze_project_risks(snapshot)


@app.get("/critical-path", response_model=schemas.CriticalPathResponse)
def get_critical_path(db: Session = Depends(get_db)):
    tasks, _, task_ids, _, forward, _ = _load_graph(db)
    path, total = graph_engine.critical_path(task_ids, forward, {t.id: t.duration_days for t in tasks})
    return schemas.CriticalPathResponse(path=path, total_duration=total)
