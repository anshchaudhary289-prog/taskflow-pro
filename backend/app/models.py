from sqlalchemy import Column, String, Integer, Date, ForeignKey, UniqueConstraint
from sqlalchemy.orm import declarative_base

Base = declarative_base()

VALID_COLUMNS = ("Backlog", "In Progress", "Review", "Done")

class Task(Base):
    __tablename__ = "tasks"

    id = Column(String, primary_key=True)
    title = Column(String, nullable=False)
    description = Column(String, default="")
    column = Column(String, nullable=False, default="Backlog")
    start_date = Column(Date, nullable=True)
    duration_days = Column(Integer, nullable=False, default=1)

class TaskDependency(Base):
    __tablename__ = "task_dependencies"
    __table_args__ = (UniqueConstraint("from_task_id", "to_task_id", name="uq_task_dependency"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    from_task_id = Column(String, ForeignKey("tasks.id"), nullable=False)
    to_task_id = Column(String, ForeignKey("tasks.id"), nullable=False)
