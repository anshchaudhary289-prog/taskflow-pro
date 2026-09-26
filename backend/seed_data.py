from datetime import date
from app.database import SessionLocal, init_db
from app.models import Task, TaskDependency
TASKS=[("t1","Design Database Schema","Backlog",2),("t2","Build Backend API","Backlog",3),("t3","Build Frontend Kanban Board","Backlog",3),("t4","Write Integration Tests","Backlog",2),("t5","Implement AI Dependency Suggestions","Backlog",2),("t6","Set Up CI Pipeline","Backlog",1),("t7","Deploy to Staging","Backlog",1),("t8","Write README & Docs","Backlog",1),("t9","Final Demo Prep","Backlog",1)]
DEPENDENCIES=[("t1","t2"),("t2","t3"),("t2","t4"),("t3","t4"),("t2","t5"),("t4","t6"),("t6","t7"),("t7","t9"),("t8","t9")]
def run():
    init_db(); db=SessionLocal()
    try:
        if db.query(Task).count()>0: print("Tasks already seeded, skipping."); return
        for tid,title,column,duration in TASKS: db.add(Task(id=tid,title=title,column=column,start_date=date.today(),duration_days=duration))
        db.commit()
        for a,b in DEPENDENCIES: db.add(TaskDependency(from_task_id=a,to_task_id=b))
        db.commit(); print(f"Seeded {len(TASKS)} tasks and {len(DEPENDENCIES)} dependencies.")
    finally: db.close()
if __name__=="__main__": run()
