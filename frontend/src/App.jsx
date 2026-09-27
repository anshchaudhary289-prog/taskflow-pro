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
      refreshBoard();
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
      setDepError(err.message);
    }
  }

  const criticalPathIds = useMemo(() => {
    if (!showCriticalPath || !criticalPathData?.path) return new Set();
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

  return (
    <div className="app">
      <h1>TaskFlow Pro</h1>
      {globalError && <div className="error-msg global">{globalError}</div>}

      <div className="toolbar">
        <form onSubmit={handleAddTask} className="add-task-form">
          <input placeholder="New task title..." value={newTaskTitle} onChange={(e) => setNewTaskTitle(e.target.value)} />
          <button type="submit">Add Task</button>
        </form>

        <form onSubmit={handleAddDependency} className="add-dep-form">
          <select value={depFrom} onChange={(e) => setDepFrom(e.target.value)}>
            <option value="">Prerequisite...</option>
            {tasks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
          <span>must finish before</span>
          <select value={depTo} onChange={(e) => setDepTo(e.target.value)}>
            <option value="">Dependent task...</option>
            {tasks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
          <button type="submit">Add Dependency</button>
        </form>
        {depError && <div className="error-msg">{depError}</div>}

        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button type="button" className={`critical-path-btn ${showCriticalPath ? "active" : ""}`} onClick={handleToggleCriticalPath} disabled={cpLoading}>
            {cpLoading ? "Loading..." : showCriticalPath ? "Hide Critical Path" : "Highlight Critical Path"}
          </button>
          <button type="button" onClick={() => setShowGraph((v) => !v)} style={{ padding: "0.4rem 0.8rem", border: "none", borderRadius: "6px", background: showGraph ? "#1d4ed8" : "#2563eb", color: "white", cursor: "pointer" }}>
            {showGraph ? "Hide Dependency Graph" : "Dependency Graph"}
          </button>
          <button type="button" onClick={handleToggleRisk} disabled={riskLoading} style={{ padding: "0.4rem 0.8rem", border: "none", borderRadius: "6px", background: showRisk ? "#6d28d9" : "#7c3aed", color: "white", cursor: riskLoading ? "not-allowed" : "pointer", opacity: riskLoading ? 0.6 : 1 }}>
            {riskLoading ? "Analyzing..." : showRisk ? "Hide AI Risk Analysis" : "AI Risk Analysis"}
          </button>
        </div>
        {cpError && <div className="error-msg">{cpError}</div>}
        {riskError && <div className="error-msg">{riskError}</div>}
      </div>

      {showCriticalPath && criticalPathData && (
        <div className="critical-path-banner">
          {criticalPathData.path?.length ? (
            <>
              <span>Critical Path: {criticalPathData.path.map(criticalPathTitle).join(" → ")}</span>
              <span className="duration-pill">Total: {criticalPathData.total_duration} days</span>
            </>
          ) : <span>No critical path found — no tasks yet.</span>}
        </div>
      )}

      {showRisk && riskData && (
        <div className="critical-path-banner" style={{ display: "block" }}>
          <div style={{ fontWeight: 700, marginBottom: "0.25rem" }}>
            AI Risk Analysis — advisory only, no schedule changes made
            {riskData.llm_used ? " (AI explanation)" : " (deterministic analysis)"}
          </div>
          <div style={{ marginBottom: "0.4rem" }}>
            <strong>{riskData.risk_level ? riskData.risk_level.toUpperCase() : ""}:</strong> {riskData.summary}
          </div>
          {riskData.explanation && riskData.explanation !== riskData.summary && (
            <div style={{ marginBottom: "0.4rem", fontStyle: "italic" }}>{riskData.explanation}</div>
          )}
          {riskData.risks?.length === 0 ? (
            <div className="no-suggestions">No significant risks detected.</div>
          ) : (
            <div className="dep-chips" style={{ flexDirection: "column", alignItems: "stretch" }}>
              {(riskData.risks || []).map((r, i) => (
                <div key={i} className="chip chip-suggested" style={{ alignItems: "flex-start", flexDirection: "column" }}>
                  <span><strong>[{r.severity} / {r.category}]</strong> {(r.task_titles || []).join(", ") || "Project"}</span>
                  <span>{r.reason}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showGraph && <div style={{ marginBottom: "1rem" }}><DependencyGraph tasks={tasks} criticalPathIds={criticalPathIds} /></div>}

      <DndContext onDragEnd={handleDragEnd}>
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
      </DndContext>
    </div>
  );
}
