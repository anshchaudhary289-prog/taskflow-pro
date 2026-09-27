import { useEffect, useState, useCallback, useMemo } from "react";
import { DndContext } from "@dnd-kit/core";
import Column from "./components/Column.jsx";
import DependencyGraph from "./components/DependencyGraph.jsx";
import "./styles.css";

const COLUMNS = ["Backlog", "In Progress", "Review", "Done"];
const API_BASE = "http://localhost:8000";

async function api(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Request failed (${res.status})`);
  }
  return res.json();
}

export default function App() {
  const [tasks, setTasks] = useState([]);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [depFrom, setDepFrom] = useState("");
  const [depTo, setDepTo] = useState("");
  const [depError, setDepError] = useState(null);
  const [globalError, setGlobalError] = useState(null);
  const [criticalPathData, setCriticalPathData] = useState(null);
  const [showCriticalPath, setShowCriticalPath] = useState(false);
  const [cpLoading, setCpLoading] = useState(false);
  const [cpError, setCpError] = useState(null);
  const [showGraph, setShowGraph] = useState(false);
  const [riskData, setRiskData] = useState(null);
  const [showRisk, setShowRisk] = useState(false);
  const [riskLoading, setRiskLoading] = useState(false);
  const [riskError, setRiskError] = useState(null);

  const refreshBoard = useCallback(() => {
    api("/board-state").then(setTasks).catch((err) => setGlobalError(err.message));
  }, []);

  useEffect(() => {
    refreshBoard();
  }, [refreshBoard]);

  async function handleDragEnd(event) {
    const { active, over } = event;
    if (!over) return;
    const taskId = active.id;
    const newColumn = over.id;
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.column === newColumn) return;

    try {
      await api(`/tasks/${taskId}`, {
        method: "PUT",
        body: JSON.stringify({ column: newColumn }),
      });
      refreshBoard(); // re-fetch from backend (source of truth) rather than trust optimistic local state
    } catch (err) {
      setGlobalError(err.message);
    }
  }

  async function handleAddTask(e) {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    const id = newTaskTitle.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40) + "-" + Date.now().toString(36);
    try {
      await api("/tasks", {
        method: "POST",
        body: JSON.stringify({ id, title: newTaskTitle.trim(), duration_days: 1 }),
      });
      setNewTaskTitle("");
      refreshBoard();
    } catch (err) {
      setGlobalError(err.message);
    }
  }

  async function handleAddDependency(e) {
    e.preventDefault();
    setDepError(null);
    if (!depFrom || !depTo || depFrom === depTo) return;
    try {
      await api("/dependencies", {
        method: "POST",
        body: JSON.stringify({ from_task_id: depFrom, to_task_id: depTo }),
      });
      setDepFrom("");
      setDepTo("");
      refreshBoard();
    } catch (err) {
      // The engine's own cycle-rejection message surfaces directly here
      setDepError(err.message);
    }
  }

  const criticalPathIds = useMemo(() => {
    if (!showCriticalPath || !criticalPathData || !criticalPathData.path) return new Set();
    return new Set(criticalPathData.path);
  }, [showCriticalPath, criticalPathData]);

  async function handleToggleCriticalPath() {
    if (showCriticalPath) {
      setShowCriticalPath(false);
      return;
    }
    setCpLoading(true);
    setCpError(null);
    try {
      const data = await api("/critical-path");
      setCriticalPathData(data);
      setShowCriticalPath(true);
    } catch (err) {
      setCpError(err.message || "Could not load critical path");
    } finally {
      setCpLoading(false);
    }
  }

  function criticalPathTitle(taskId) {
    return tasks.find((t) => t.id === taskId)?.title || taskId;
  }

  async function requestSuggestions(taskId) {
    return api(`/tasks/${taskId}/suggest-dependencies`);
  }

  async function acceptSuggestion(fromTaskId, toTaskId) {
    await api("/dependencies", {
      method: "POST",
      body: JSON.stringify({ from_task_id: fromTaskId, to_task_id: toTaskId }),
    });
    refreshBoard();
  }

  async function requestBreakdown(taskId) {
    return api(`/tasks/${taskId}/breakdown`);
  }

  async function simulateDelay(taskId, deltaDays) {
    return api(`/tasks/${taskId}/shift`, {
      method: "POST",
      body: JSON.stringify({ delta_days: deltaDays }),
    });
  }

  async function handleToggleRisk() {
    if (showRisk) {
      setShowRisk(false);
      return;
    }
    setRiskLoading(true);
    setRiskError(null);
    try {
      const data = await api("/risk-analysis");
      setRiskData(data);
      setShowRisk(true);
    } catch (err) {
      setRiskError(err.message || "Could not load risk analysis");
    } finally {
      setRiskLoading(false);
    }
  }

  const readyCount = tasks.filter((t) => t.status === "Ready").length;
  const blockedCount = tasks.filter((t) => t.status === "Blocked").length;
  const inProgressCount = tasks.filter((t) => t.column === "In Progress").length;
  const criticalCount = showCriticalPath && criticalPathData && criticalPathData.path
    ? criticalPathData.path.length
    : null;

  function scrollTo(id) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo-mark">TF</span>
          <div>
            <span className="brand-name">TaskFlow Pro</span>
            <span className="brand-sub">Project Dashboard</span>
          </div>
        </div>
        <div className="topbar-status" title="Live project health">
          <span className={`status-dot ${blockedCount > 0 ? "warn" : ""}`} />
          {tasks.length === 0
            ? "No tasks yet"
            : `${blockedCount} blocked · ${readyCount} ready`}
        </div>
        <nav className="topbar-nav" aria-label="Dashboard sections">
          <button type="button" className="topbar-link" onClick={() => scrollTo("board-section")}>Board</button>
          <button type="button" className="topbar-link" onClick={() => scrollTo("intel-section")}>Project Intelligence</button>
        </nav>
      </header>

      {globalError && <div className="error-msg global">{globalError}</div>}

      <section className="stats-row" aria-label="Project summary">
        <div className="stat-card">
          <span className="stat-icon total">📋</span>
          <div><div className="stat-value">{tasks.length}</div><div className="stat-label">Total Tasks</div></div>
        </div>
        <div className="stat-card">
          <span className="stat-icon ready">✓</span>
          <div><div className="stat-value">{readyCount}</div><div className="stat-label">Ready</div></div>
        </div>
        <div className="stat-card">
          <span className="stat-icon blocked">⛔</span>
          <div><div className="stat-value">{blockedCount}</div><div className="stat-label">Blocked</div></div>
        </div>
        <div className="stat-card">
          <span className="stat-icon progress">🔄</span>
          <div><div className="stat-value">{inProgressCount}</div><div className="stat-label">In Progress</div></div>
        </div>
        <div className="stat-card">
          <span className="stat-icon critical">⏳</span>
          <div><div className="stat-value">{criticalCount === null ? "–" : criticalCount}</div><div className="stat-label">Critical Path</div></div>
        </div>
      </section>

      <div className="toolbar">
        <div>
          <div className="toolbar-title">＋ New task</div>
          <form onSubmit={handleAddTask} className="add-task-form">
            <input
              placeholder="New task title..."
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              aria-label="New task title"
            />
            <button type="submit">Add Task</button>
          </form>
        </div>

        <div>
          <div className="toolbar-title">⛓ Link dependencies</div>
          <form onSubmit={handleAddDependency} className="add-dep-form">
            <select value={depFrom} onChange={(e) => setDepFrom(e.target.value)} aria-label="Prerequisite task">
              <option value="">Prerequisite...</option>
              {tasks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
            <span className="dep-arrow">must finish before</span>
            <select value={depTo} onChange={(e) => setDepTo(e.target.value)} aria-label="Dependent task">
              <option value="">Dependent task...</option>
              {tasks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
            <button type="submit">Add Dependency</button>
          </form>
          {depError && <div className="error-msg">{depError}</div>}
        </div>
      </div>

      <div className="section-head" id="board-section">
        <h2>Kanban Board</h2>
        <p>Drag cards between columns — blocked state updates automatically.</p>
      </div>

      <DndContext onDragEnd={handleDragEnd}>
        <div className="board-scroll">
          <div className="board">
            {COLUMNS.map((column) => (
              <Column
                key={column}
                column={column}
                tasks={tasks.filter((t) => t.column === column)}
                allTasks={tasks}
                onRequestSuggestions={requestSuggestions}
                onAcceptSuggestion={acceptSuggestion}
                onSimulateDelay={simulateDelay}
                onRequestBreakdown={requestBreakdown}
                criticalPathIds={criticalPathIds}
              />
            ))}
          </div>
        </div>
      </DndContext>

      <div className="section-head" id="intel-section">
        <h2>Project Intelligence</h2>
        <p>Schedule insight powered by the dependency graph — advisory only.</p>
      </div>

      <section className="intel-grid">
        <article className="intel-card">
          <div className="intel-card-head">
            <span className="intel-icon amber">⏳</span>
            <div>
              <div className="intel-title">Critical Path</div>
              <div className="intel-sub">Longest chain · drives the deadline</div>
            </div>
            <button
              type="button"
              className="intel-toggle amber"
              onClick={handleToggleCriticalPath}
              disabled={cpLoading}
            >
              {cpLoading ? "Loading..." : showCriticalPath ? "Hide" : "Reveal"}
            </button>
          </div>
          <div className="intel-body">
            {cpError && <div className="error-msg">{cpError}</div>}
            {showCriticalPath && criticalPathData ? (
              criticalPathData.path && criticalPathData.path.length > 0 ? (
                <>
                  <div className="cp-chain">
                    {criticalPathData.path.map((pid, i) => (
                      <span key={pid} style={{ display: "contents" }}>
                        {i > 0 && <span className="cp-link">→</span>}
                        <span className="cp-node" title={criticalPathTitle(pid)}>
                          {criticalPathTitle(pid)}
                        </span>
                      </span>
                    ))}
                  </div>
                  <div className="critical-path-banner">
                    <span>Scheduled duration of the critical chain</span>
                    <span className="duration-pill">
                      Total: {criticalPathData.total_duration} days
                    </span>
                  </div>
                </>
              ) : (
                <p className="intel-hint">No critical path found — no tasks yet.</p>
              )
            ) : (
              <p className="intel-hint">
                Reveal the longest dependency chain. Tasks on this path are highlighted across the board and graph.
              </p>
            )}
          </div>
        </article>

        <article className="intel-card">
          <div className="intel-card-head">
            <span className="intel-icon blue">🕸</span>
            <div>
              <div className="intel-title">Dependency Graph</div>
              <div className="intel-sub">Prerequisite → dependent map</div>
            </div>
            <button
              type="button"
              className="intel-toggle blue"
              onClick={() => setShowGraph((v) => !v)}
            >
              {showGraph ? "Hide" : "Show"}
            </button>
          </div>
          <div className="intel-body">
            {showGraph ? (
              <DependencyGraph tasks={tasks} criticalPathIds={criticalPathIds} />
            ) : (
              <p className="intel-hint">
                Visualize every task and dependency as a DAG. Blocked and critical-path nodes are highlighted.
              </p>
            )}
          </div>
        </article>

        <article className="intel-card">
          <div className="intel-card-head">
            <span className="intel-icon violet">✨</span>
            <div>
              <div className="intel-title">AI Risk Analysis</div>
              <div className="intel-sub">Advisory · never changes the schedule</div>
            </div>
            <button
              type="button"
              className="intel-toggle violet"
              onClick={handleToggleRisk}
              disabled={riskLoading}
            >
              {riskLoading ? "Analyzing..." : showRisk ? "Hide" : "Analyze"}
            </button>
          </div>
          <div className="intel-body">
            {riskError && <div className="error-msg">{riskError}</div>}
            {showRisk && riskData ? (
              <>
                <div className="risk-summary">
                  <span className={`risk-level ${riskData.risk_level}`}>{riskData.risk_level}</span>
                  <span>{riskData.summary}</span>
                </div>
                {riskData.explanation && riskData.explanation !== riskData.summary && (
                  <p className="intel-hint" style={{ fontStyle: "italic", marginBottom: "0.5rem" }}>
                    {riskData.explanation}
                  </p>
                )}
                {riskData.risks && riskData.risks.length === 0 ? (
                  <div className="no-suggestions">No significant risks detected. 🎉</div>
                ) : (
                  <div className="risk-list">
                    {(riskData.risks || []).map((r, i) => (
                      <div key={i} className={`risk-item sev-${r.severity}`}>
                        <div className="risk-item-head">
                          <span className="risk-cat">{r.severity} · {r.category}</span>
                          <span className="risk-tasks">{(r.task_titles || []).join(", ") || "Project"}</span>
                        </div>
                        <p className="risk-reason">{r.reason}</p>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="intel-hint">
                Scan blocked tasks, bottlenecks and critical-path exposure
                {riskData && riskData.llm_used ? " with an AI explanation." : " with deterministic analysis."}
              </p>
            )}
          </div>
        </article>
      </section>

      <footer className="footer">TaskFlow Pro · DAG-powered scheduling · AI features are advisory only</footer>
    </div>
  );
}
