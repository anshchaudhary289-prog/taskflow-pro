import { useDraggable } from "@dnd-kit/core";
import { useState } from "react";

export default function TaskCard({ task, allTasks, onAcceptSuggestion, onRequestSuggestions, onSimulateDelay, onRequestBreakdown, isCriticalPath }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id });
  const [suggestions, setSuggestions] = useState(null);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [error, setError] = useState(null);
  const [showDelayForm, setShowDelayForm] = useState(false);
  const [delayInput, setDelayInput] = useState("");
  const [delayResult, setDelayResult] = useState(null);
  const [delayLoading, setDelayLoading] = useState(false);
  const [delayError, setDelayError] = useState(null);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [breakdown, setBreakdown] = useState(null);
  const [loadingBreakdown, setLoadingBreakdown] = useState(false);
  const [breakdownError, setBreakdownError] = useState(null);

  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.4 : task.status === "Blocked" ? 0.6 : 1,
  };

  const prerequisiteTitles = (task.prerequisite_ids || []).map((pid) => allTasks.find((t) => t.id === pid)?.title).filter(Boolean);

  async function handleGetSuggestions(e) {
    e.stopPropagation(); setLoadingSuggestions(true); setError(null);
    try { const result = await onRequestSuggestions(task.id); setSuggestions(result.suggestions); }
    catch { setError("Could not fetch suggestions"); }
    finally { setLoadingSuggestions(false); }
  }

  async function handleAccept(suggestion, e) {
    e.stopPropagation(); setError(null);
    try { await onAcceptSuggestion(suggestion.task_id, task.id); setSuggestions((prev) => prev.filter((s) => s.task_id !== suggestion.task_id)); }
    catch (err) { setError(err.message || "Rejected: would create a cycle"); }
  }

  function handleOpenDelayForm(e) { e.stopPropagation(); setShowDelayForm(true); setDelayError(null); }
  function handleCloseDelayForm(e) { if (e) e.stopPropagation(); setShowDelayForm(false); setDelayInput(""); setDelayResult(null); setDelayError(null); }

  async function handleRunSimulation(e) {
    e.stopPropagation(); setDelayError(null); setDelayResult(null);
    const trimmed = delayInput.trim();
    if (!trimmed) return setDelayError("Enter a delay in days.");
    const parsed = Number(trimmed);
    if (!Number.isInteger(parsed)) return setDelayError("Delay must be a whole number of days.");
    if (parsed === 0) return setDelayError("Enter a non-zero number of days.");
    setDelayLoading(true);
    try { const result = await onSimulateDelay(task.id, parsed); setDelayResult({ deltaDays: parsed, affected: result.affected_tasks || {} }); }
    catch (err) { setDelayError(err.message || "Could not simulate delay"); }
    finally { setDelayLoading(false); }
  }

  function delayTitle(taskId) { return allTasks.find((t) => t.id === taskId)?.title || taskId; }
  function formatShift(days) { return days > 0 ? `+${days}d` : `${days}d`; }

  async function handleToggleBreakdown(e) {
    e.stopPropagation();
    if (showBreakdown) return setShowBreakdown(false);
    setShowBreakdown(true); setBreakdownError(null);
    if (breakdown) return;
    setLoadingBreakdown(true);
    try { setBreakdown(await onRequestBreakdown(task.id)); }
    catch (err) { setBreakdownError(err.message || "Could not fetch breakdown"); }
    finally { setLoadingBreakdown(false); }
  }

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes} className={`task-card ${isCriticalPath ? "task-card-critical" : ""}`}>
      <div className="task-card-header">
        <strong>{task.title}{isCriticalPath && <span className="critical-path-badge">Critical Path</span>}</strong>
        <span className={`status-badge status-${task.status.toLowerCase()}`}>{task.status}</span>
      </div>
      {task.description && <p className="task-desc">{task.description}</p>}
      {prerequisiteTitles.length > 0 && <div className="dep-chips">{prerequisiteTitles.map((title) => <span key={title} className="chip chip-dependency">{title}</span>)}</div>}

      <button className="suggest-btn" onClick={handleGetSuggestions} disabled={loadingSuggestions}>
        {loadingSuggestions ? "Thinking..." : "Suggest Dependencies (AI)"}
      </button>
      {error && <div className="error-msg">{error}</div>}
      {suggestions?.length === 0 && <div className="no-suggestions">No suggested prerequisites</div>}
      {suggestions?.length > 0 && <div className="suggestions-list">{suggestions.map((s) => (
        <div key={s.task_id} className="chip chip-suggested"><span title={s.justification}>{s.task_title}</span><button onClick={(e) => handleAccept(s, e)}>Accept</button></div>
      ))}</div>}

      <button className="suggest-btn" onClick={handleToggleBreakdown} disabled={loadingBreakdown}>
        {loadingBreakdown ? "Breaking down..." : showBreakdown ? "Hide AI Task Breakdown" : "AI Task Breakdown"}
      </button>
      {showBreakdown && <div className="suggestions-list" style={{ flexDirection: "column", alignItems: "stretch" }} onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
        <div style={{ fontSize: "0.75rem", fontWeight: 600 }}>AI-generated advisory preview — nothing was added to the board</div>
        {breakdownError && <div className="error-msg">{breakdownError}</div>}
        {breakdown?.subtasks?.length ? <div className="dep-chips" style={{ flexDirection: "column", alignItems: "stretch" }}>
          {breakdown.subtasks.map((s, i) => <div key={i} className="chip chip-suggested" style={{ alignItems: "flex-start", flexDirection: "column" }}><strong>{s.title}</strong>{s.description && <span>{s.description}</span>}</div>)}
        </div> : breakdown && !breakdownError ? <div className="no-suggestions">No subtasks suggested.</div> : null}
      </div>}

      {!showDelayForm ? <button className="suggest-btn" onClick={handleOpenDelayForm}>Simulate Delay</button> :
        <div className="suggestions-list" style={{ flexDirection: "column", alignItems: "stretch" }} onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
          <div style={{ fontSize: "0.75rem", fontWeight: 600 }}>Simulate Delay — Preview only, schedule is not changed</div>
          <div style={{ display: "flex", gap: "0.3rem", alignItems: "center", flexWrap: "wrap" }}>
            <input placeholder="Days (e.g. 3)" value={delayInput} onChange={(e) => setDelayInput(e.target.value)} onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} style={{ padding: "0.2rem 0.5rem", border: "1px solid #ccc", borderRadius: "6px", fontSize: "0.75rem", width: "110px" }}/>
            <button className="suggest-btn" onClick={handleRunSimulation} disabled={delayLoading}>{delayLoading ? "Simulating..." : "Run"}</button>
            <button className="suggest-btn" onClick={handleCloseDelayForm} disabled={delayLoading}>Close</button>
          </div>
          {delayError && <div className="error-msg">{delayError}</div>}
          {delayResult && <div style={{ fontSize: "0.75rem" }}>
            <div><strong>{task.title}</strong> {formatShift(delayResult.deltaDays)} (preview)</div>
            {Object.keys(delayResult.affected).length === 0 ? <div className="no-suggestions">No downstream tasks affected.</div> :
              <div className="dep-chips">{Object.entries(delayResult.affected).map(([tid, shift]) => <span key={tid} className="chip chip-dependency">{delayTitle(tid)}: {formatShift(shift)}</span>)}</div>}
            <div className="no-suggestions">Simulation preview — no dates were modified.</div>
          </div>}
        </div>}
    </div>
  );
}
