# TaskFlow Pro

TaskFlow Pro is a dependency-aware project scheduling application built around a directed acyclic graph (DAG). It combines a Kanban workflow with dependency validation, blocked/ready status, critical-path analysis, delay simulation, an interactive dependency map, and AI-assisted planning.

## Highlights
- Kanban workflow: Backlog, In Progress, Review, Done
- DAG-based dependencies with cycle and duplicate protection
- Ready/Blocked status derived from prerequisites
- No-Compounding schedule propagation
- Critical Path calculation and visualization
- Delay / what-if simulation
- AI dependency suggestions with explicit human acceptance
- AI task breakdown and graph-aware risk analysis
- Deterministic fallbacks when Gemini is unavailable
- Unit tests for the graph engine

## Setup

Backend:
```bash
cd backend
python -m venv .venv
# Windows: .venv\\Scripts\\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
# copy .env.example .env on Windows, or cp .env.example .env
uvicorn app.main:app --reload
```

API: http://localhost:8000  
Swagger: http://localhost:8000/docs

Optional demo data:
```bash
cd backend
python seed_data.py
```

Frontend:
```bash
cd frontend
npm install
# copy .env.example .env on Windows, or cp .env.example .env
npm run dev
```

Frontend: http://localhost:5173

Tests:
```bash
cd backend
pytest -q
```

## Architecture
```
React/Vite -> FastAPI -> SQLAlchemy/SQLite
                 |
                 +-> DAG engine: cycles, topological order, blocked/ready,
                 |              critical path, no-compounding propagation
                 |
                 +-> AI layer: suggestions, breakdown, risk, what-if
```

## Core scheduling rule
For A -> B -> D and A -> C -> D, moving A by +3 days moves D by +3, not +6. Parallel paths are combined with the maximum incoming shift.

## AI safety boundary
AI is advisory. It never writes directly to the graph. Accepted dependency suggestions go through the normal dependency endpoint and its validation. If Gemini is unavailable, deterministic fallback logic keeps the demo usable.

## Environment
Backend .env:
```env
GEMINI_API_KEY=your_key_here
```
Frontend .env:
```env
VITE_API_URL=http://localhost:8000
```
Never commit real .env files or API keys.

## Demo flow
1. Start backend and frontend.
2. Seed demo data.
3. Show Kanban + Ready/Blocked states.
4. Show Dependency Map and Critical Path.
5. Simulate a +3 day delay on a critical task.
6. Show downstream impact and what-if explanation.
7. Run AI Risk Analysis.
8. Generate a task breakdown.
9. Request and explicitly accept an AI dependency suggestion.

## Key Assumptions and Limitations

### Assumptions

- Each task belongs to a single project and has a unique task ID.
- A dependency represents a prerequisite relationship from one task to another.
- A task becomes Ready only when all of its direct prerequisite tasks are completed.
- Schedule propagation uses the maximum delay across converging dependency paths to avoid double-counting shared upstream delays.
- AI-generated dependency suggestions are advisory and require explicit human acceptance before they modify the dependency graph.
- The seeded project data is intended to demonstrate realistic task dependencies and scheduling behavior.

### Limitations

- The current demonstration uses SQLite for local persistence; a production deployment could use a managed relational database.
- Gemini integration is optional. When an API key is unavailable, deterministic fallback logic is used for the AI-assisted features.
- AI suggestions are generated from the tasks and project context currently available in the application.
- Authentication, role-based access control, and multi-user collaboration are outside the current hackathon scope.
- The current deployment configuration is intended for demonstration and evaluation rather than production-scale workloads.

## AI-Tool Declaration

ChatGPT and Claude were used during development of TaskFlow Pro. ChatGPT was used for planning, architecture discussions, debugging guidance, test-case design, documentation assistance, and frontend/UI refinement. Claude was used for code-generation assistance, implementation refinement, debugging, and development workflow support. All generated code was reviewed, integrated, tested, and validated by the participant. The final application, repository structure, testing, and submission decisions were reviewed by the participant.

## Hackathon compliance
Before final submission, verify the event rules for source provenance, build-window requirements, AI-tool declarations, and commit history. Do not publish restricted reference material or secrets.
