# TaskFlow Pro — Design Document

## 1. System Overview

TaskFlow Pro is a dependency-aware project scheduling application that combines a Kanban workflow with a directed acyclic graph (DAG) model.

The system is designed around four core behaviors:

1. Tasks are managed through Backlog, In Progress, Review, and Done states.
2. Dependencies define prerequisite relationships between tasks.
3. The graph engine prevents invalid dependency cycles and calculates scheduling effects.
4. AI features provide advisory suggestions; human acceptance is required before graph changes are applied.

## 2. Architecture

```
React + Vite Frontend
        |
        | HTTP/JSON
        v
FastAPI Backend
        |
        +----------------------+ 
        |                      |
        v                      v
SQLAlchemy / SQLite       AI Suggestion Layer
        |                      |
        v                      v
Task + Dependency Data    Gemini (optional)
        |
        v
DAG / Scheduling Engine
```

### Frontend

The React/Vite frontend provides Kanban drag-and-drop, task creation and updates, dependency creation, dependency suggestion review, dependency graph visualization, critical-path visualization, delay/what-if simulation, risk analysis, task breakdown, and the Project Health Command Center.

### Backend

The FastAPI backend exposes task, dependency, scheduling, AI-assisted planning, risk, breakdown, what-if, and critical-path endpoints. API handling, graph/scheduling logic, schemas, and AI-assisted logic are separated into backend modules.

## 3. Data Model

The core model contains two primary entities.

### Task

A task represents a unit of project work. Important attributes include task ID, title, description, duration, status/workflow column, start date, due date, and completion state.

Each task has a unique identifier.

### Dependency

A dependency represents a directed prerequisite relationship:

```
source task -> dependent task
```

The graph engine rejects self-dependencies, duplicate edges, direct cycles, and transitive cycles.

## 4. Scheduling and Graph Rules

### DAG validation

Every dependency is validated before persistence. An edge that would introduce a cycle is rejected.

### Ready / Blocked

A task is Ready when its direct prerequisite tasks are completed; otherwise it is Blocked.

### Critical path

The scheduling engine calculates the longest dependency-driven path and exposes it to the UI.

### No-compounding propagation

For converging paths such as:

```
      -> B ->
A              -> D
      -> C ->
```

a delay on A is applied to D once. A +3-day delay therefore produces +3 days of impact at D, not +6 days. The maximum incoming propagated shift is used at convergence points.

### What-if simulation

Delay simulations calculate downstream impact without permanently changing the schedule.

## 5. AI Design and Safety Boundary

AI features are advisory: dependency suggestions, task breakdown, risk analysis, and what-if explanations.

The dependency workflow is:

```
AI suggestion -> Human review -> Explicit acceptance
-> Normal dependency API -> DAG validation -> Persistence
```

AI cannot bypass graph validation. Gemini is optional; deterministic fallbacks keep the demonstration usable when Gemini is unavailable.

## 6. Project Health Command Center

The Command Center derives project-level signals from existing task and dependency data. It presents overall project health, critical delivery-chain duration, critical-path task count, blocked-task attention, in-progress/ready workload, and a recommended next action.

It is a presentation layer over existing scheduling and task state, not a second scheduling engine.

## 7. Testing and Reliability

The graph-engine tests cover direct and transitive cycle rejection, valid edges, topological ordering, positive and negative diamond propagation, no-compounding behavior, simple chains, unrelated branches, Ready/Blocked behavior, and critical-path calculation.

CI runs backend tests and the frontend production build.

## 8. Known Limitations

- SQLite is used for the hackathon demonstration; production deployment could use a managed relational database.
- Gemini is optional and deterministic fallbacks are used when it is unavailable.
- AI suggestions use the project context currently available to the application.
- Authentication and role-based access control are outside the current hackathon scope.
- Multi-user real-time collaboration is outside the current scope.
- The deployment configuration is intended for demonstration/evaluation rather than production-scale workloads.
- The project focuses on dependency-aware scheduling rather than replacing a complete enterprise project-management suite.

## 9. Security and Repository Assumptions

- API keys are supplied through environment variables.
- Real `.env` files are excluded from version control.
- Build artifacts, virtual environments, caches, databases, and dependency directories are excluded through `.gitignore`.
- AI-generated dependency suggestions cannot directly modify the graph without human acceptance and backend validation.
