from datetime import date
from typing import Optional
from pydantic import BaseModel


class TaskCreate(BaseModel):
    id: str
    title: str
    description: str = ""
    column: str = "Backlog"
    start_date: Optional[date] = None
    duration_days: int = 1


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    column: Optional[str] = None
    start_date: Optional[date] = None
    duration_days: Optional[int] = None


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


class RiskFactor(BaseModel):
    category: str
    severity: str
    task_ids: list[str] = []
    task_titles: list[str] = []
    reason: str


class RiskAnalysisResponse(BaseModel):
    summary: str
    risk_level: str
    risks: list[RiskFactor] = []
    explanation: str = ""
    llm_used: bool = False


class SubtaskSuggestion(BaseModel):
    title: str
    description: str = ""


class TaskBreakdownResponse(BaseModel):
    task_id: str
    task_title: str
    subtasks: list[SubtaskSuggestion] = []
    llm_used: bool = False
