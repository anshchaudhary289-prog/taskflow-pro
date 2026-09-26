# TaskFlow Pro

TaskFlow Pro is a dependency-aware project scheduling application built around a directed acyclic graph (DAG). It combines a Kanban workflow with dependency validation, blocked/ready status, critical-path analysis, delay simulation, an interactive dependency map, and AI-assisted planning.

## Highlights

- Kanban workflow: Backlog, In Progress, Review, Done
- DAG-based task dependencies
- Cycle prevention and duplicate-dependency protection
- Ready/Blocked status derived from prerequisites
- No-Compounding schedule propagation
- Critical Path calculation and visualization
- Delay / what-if simulation
- AI dependency suggestions with explicit human acceptance
- AI task breakdown
- Graph-aware AI risk analysis
- Deterministic fallbacks when Gemini is unavailable
- Unit tests for the core graph engine

## Architecture

```
React + Vite
    |
    | REST
    v
FastAPI
    |
    +-- SQLAlchemy --> SQLite
    |
    +-- Graph Engine
    |      +-- cycle detection
    |      +-- topological ordering
    |      +-- blocked/ready
    |      +-- critical path
    |      +-- no-compounding propagation
    |
    +-- AI layer
           +-- dependency suggestions
           +-- task breakdown
           +-- risk analysis
           +-- what-if explanation
```

## Project structure

```
taskflow-pro/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── models.py
│   │   ├── schemas.py
│   │   ├── database.py
│   │   ├── graph_engine.py
│   │   └── ai_suggestions.py
│   ├── tests/
│   ├── seed_data.py
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   ├── package.json
│   └── .env.example
├── .gitignore
└── README.md
```

## Backend setup

Windows:

```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload
```

macOS/Linux:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload
```

API: http://localhost:8000  
Swagger UI: http://localhost:8000/docs

Optional demo data:

```bash
cd backend
python seed_data.py
```

## Frontend setup

```bash
cd frontend
npm install
```

Windows:

```powershell
copy .env.example .env
```

macOS/Linux:

```bash
cp .env.example .env
```

Then:

```bash
npm run dev
```

Frontend: http://localhost:5173

## Tests

From `backend/`:

```bash
pytest -q
```

The graph-engine suite covers cycle detection, topological ordering, blocked/ready status, critical-path calculation, positive and negative propagation, diamond dependencies, and unrelated branches.

## Environment variables

Backend `.env`:

```env
GEMINI_API_KEY=your_key_here
```

Frontend `.env`:

```env
VITE_API_URL=http://localhost:8000
```

Never commit real `.env` files or API keys.

## Core scheduling rule

For a graph such as:

```
A -> B -> D
A -> C -> D
```

if A moves by +3 days, D moves by +3 days, not +6. Parallel dependency paths are combined using the maximum incoming shift rather than summing them.

## AI safety boundary

AI suggestions are advisory. The model never writes directly to the dependency graph. Accepted suggestions go through the normal dependency endpoint, where task existence, duplicate dependencies, self-dependencies, and cycle creation are validated.

If Gemini is unavailable, deterministic fallback logic keeps the demo functional.

## Demo flow

1. Start backend and frontend.
2. Seed the sample project.
3. Show the Kanban board and Ready/Blocked states.
4. Show the dependency map.
5. Highlight the critical path.
6. Simulate a +3 day delay on a critical task.
7. Explain the downstream impact using the what-if panel.
8. Run AI risk analysis.
9. Generate an AI/deterministic task breakdown.
10. Use dependency suggestions and explicitly accept one.

## Hackathon compliance

Before final submission, verify the event's current rules for source provenance, build-window requirements, AI-tool declarations, and commit history. Keep only code that is permitted by those rules and do not publish restricted reference material or secrets.
