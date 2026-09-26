from datetime import date
from typing import Literal, Optional
from pydantic import BaseModel, Field

class TaskCreate(BaseModel):
    id: str
    title: str
    description: str = ""
    column: Literal["Backlog", "In Progress", "Review", "Done"] = "Backlog"
    start_date: Optional[date] = None
    duration_days: int = Field(default=1, ge=1)

class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    column: Optional[Literal["Backlog", "In Progress", "Review", "Done"]] = None
    start_date: Optional[date] = None
    duration_days: Optional[int] = Field(default=None, ge=1)

class TaskOut(BaseModel):
    id: str
    title: str
    description: str
    column: str
    start_date: Optional[date]
    duration_days: int
    status: str
    prerequisite_ids: list[str] = []

    class Config:
        from_attributes = True

class DependencyCreate(BaseModel):
    from_task_id: str
    to_task_id: str

class DependencyOut(BaseModel):
    id: int
    from_task_id: str
    to_task_id: str

    class Config:
        from_attributes = True

class ShiftRequest(BaseModel):
    delta_days: int

class ShiftResponse(BaseModel):
    affected_tasks: dict

class CriticalPathResponse(BaseModel):
    path: list
    total_duration: int

class WhatIfResponse(BaseModel):
    delta_days: int
    critical_path_duration: int
    explanation: dict
