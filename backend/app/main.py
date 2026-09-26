from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from . import models, schemas, graph_engine, ai_suggestions
from .database import init_db, get_db

app=FastAPI(title="TaskFlow Pro API")
app.add_middleware(CORSMiddleware,allow_origins=["http://localhost:5173"],allow_methods=["*"],allow_headers=["*"])

@app.on_event("startup")
def startup(): init_db()

def load_graph(db):
    tasks=db.query(models.Task).all()
    deps=db.query(models.TaskDependency).all()
    ids=[t.id for t in tasks]
    edges=[(d.from_task_id,d.to_task_id) for d in deps]
    forward,reverse=graph_engine.build_adjacency(ids,edges)
    return tasks,deps,ids,edges,forward,reverse

def task_out(t,status,reverse=None):
    return schemas.TaskOut(id=t.id,title=t.title,description=t.description,column=t.column,start_date=t.start_date,duration_days=t.duration_days,status=status,prerequisite_ids=sorted(reverse.get(t.id,[])) if reverse else [])

@app.post("/tasks",response_model=schemas.TaskOut)
def create_task(p:schemas.TaskCreate,db:Session=Depends(get_db)):
    if db.query(models.Task).filter_by(id=p.id).first(): raise HTTPException(400,"Task id already exists")
    t=models.Task(**p.dict()); db.add(t); db.commit(); db.refresh(t); return task_out(t,"Ready")

@app.get("/board-state",response_model=list[schemas.TaskOut])
def board(db:Session=Depends(get_db)):
    ts,_,ids,_,_,rev=load_graph(db)
    cols={t.id:t.column for t in ts}
    st=graph_engine.compute_blocked_status(ids,rev,cols)
    return [task_out(t,st[t.id],rev) for t in ts]

@app.put("/tasks/{task_id}",response_model=schemas.TaskOut)
def update(task_id:str,p:schemas.TaskUpdate,db:Session=Depends(get_db)):
    t=db.query(models.Task).filter_by(id=task_id).first()
    if not t: raise HTTPException(404,"Task not found")
    for k,v in p.dict(exclude_unset=True).items(): setattr(t,k,v)
    db.commit()
    ts,_,ids,_,_,rev=load_graph(db)
    cols={x.id:x.column for x in ts}
    st=graph_engine.compute_blocked_status(ids,rev,cols)
    return task_out(t,st[t.id],rev)

@app.post("/dependencies",response_model=schemas.DependencyOut)
def dependency(p:schemas.DependencyCreate,db:Session=Depends(get_db)):
    for tid in (p.from_task_id,p.to_task_id):
        if not db.query(models.Task).filter_by(id=tid).first(): raise HTTPException(404,f"Task {tid} not found")
    _,_,ids,_,forward,_=load_graph(db)
    if p.from_task_id==p.to_task_id: raise HTTPException(409,"A task cannot depend on itself")
    if db.query(models.TaskDependency).filter_by(from_task_id=p.from_task_id,to_task_id=p.to_task_id).first(): raise HTTPException(409,"This dependency already exists")
    if graph_engine.creates_cycle(forward,p.from_task_id,p.to_task_id): raise HTTPException(409,"Rejected: dependency would create a cycle. The graph is unchanged.")
    d=models.TaskDependency(from_task_id=p.from_task_id,to_task_id=p.to_task_id); db.add(d); db.commit(); db.refresh(d); return d

@app.post("/tasks/{task_id}/shift",response_model=schemas.ShiftResponse)
def shift(task_id:str,p:schemas.ShiftRequest,db:Session=Depends(get_db)):
    _,_,ids,_,f,r=load_graph(db)
    if task_id not in ids: raise HTTPException(404,"Task not found")
    return {"affected_tasks":graph_engine.propagate_shift(ids,f,r,task_id,p.delta_days)}

@app.get("/tasks/{task_id}/suggest-dependencies")
def suggest(task_id:str,db:Session=Depends(get_db)):
    t=db.query(models.Task).filter_by(id=task_id).first()
    if not t: raise HTTPException(404,"Task not found")
    others=db.query(models.Task).filter(models.Task.id!=task_id).all()
    data=[{"id":x.id,"title":x.title,"description":x.description} for x in others]
    return {"suggestions":ai_suggestions.suggest_dependencies({"id":t.id,"title":t.title,"description":t.description},data)}

@app.get("/tasks/{task_id}/breakdown")
def breakdown(task_id:str,db:Session=Depends(get_db)):
    t=db.query(models.Task).filter_by(id=task_id).first()
    if not t: raise HTTPException(404,"Task not found")
    return {"task_id":t.id,"task_title":t.title,"subtasks":ai_suggestions.breakdown_task({"id":t.id,"title":t.title,"description":t.description})}

@app.post("/tasks/{task_id}/what-if",response_model=schemas.WhatIfResponse)
def what_if(task_id:str,p:schemas.ShiftRequest,db:Session=Depends(get_db)):
    t=db.query(models.Task).filter_by(id=task_id).first()
    if not t: raise HTTPException(404,"Task not found")
    ts,_,ids,_,f,r=load_graph(db)
    affected=graph_engine.propagate_shift(ids,f,r,task_id,p.delta_days)
    titles={x.id:x.title for x in ts}
    cp,total=graph_engine.critical_path(ids,f,{x.id:x.duration_days for x in ts})
    ex=ai_suggestions.explain_what_if(t.title,p.delta_days,affected,titles,cp)
    return {"delta_days":p.delta_days,"critical_path_duration":total,"explanation":ex}

@app.get("/risk-analysis")
def risk(db:Session=Depends(get_db)):
    ts,_,ids,edges,f,r=load_graph(db)
    cols={t.id:t.column for t in ts}
    blocked=graph_engine.compute_blocked_status(ids,r,cols)
    cp,_=graph_engine.critical_path(ids,f,{t.id:t.duration_days for t in ts})
    data=[{"id":t.id,"title":t.title,"duration_days":t.duration_days,"status":blocked[t.id]} for t in ts]
    return {"risks":ai_suggestions.analyze_risks(data,edges,cp),"critical_path":cp}

@app.get("/critical-path",response_model=schemas.CriticalPathResponse)
def critical(db:Session=Depends(get_db)):
    ts,_,ids,_,f,_=load_graph(db)
    p,total=graph_engine.critical_path(ids,f,{t.id:t.duration_days for t in ts})
    return {"path":p,"total_duration":total}
