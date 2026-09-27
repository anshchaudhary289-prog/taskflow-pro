import { useDraggable } from "@dnd-kit/core";
import { useState } from "react";

export default function TaskCard({ task, allTasks, onAcceptSuggestion, onRequestSuggestions, onSimulateDelay, onRequestBreakdown, isCriticalPath }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
  });

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

  const prerequisiteTitles = (task.prerequisite_ids || [])
    .map((pid) => allTasks.find((t) => t.id === pid)?.title)
    .filter(Boolean);

  async function handleGetSuggestions(e) {
    e.stopPropagation();
    setLoadingSuggestions(true);
    setError(null);
    try {
      const result = await onRequestSuggestions(task.id);
      setSuggestions(result.suggestions);
    } catch (err) {
      setError("Could not fetch suggestions");
    } finally {
      setLoadingSuggestions(false);
    }
  }

  async function handleAccept(suggestion, e) {
    e.stopPropagation();
    setError(null);
    try {
      await onAcceptSuggestion(suggestion.task_id, task.id);
      setSuggestions((prev) => prev.filter((s) => s.task_id !== suggestion.task_id));
    } catch (err) {
      // Cycle rejections (409) surface here - show the engine's own message
      setError(err.message || "Rejected: would create a cycle");
    }
  }

  function handleOpenDelayForm(e) {
    e.stopPropagation();
    setShowDelayForm(true);
    setDelayError(null);
  }

  function handleCloseDelayForm(e) {
    if (e) e.stopPropagation();
    setShowDelayForm(false);
    setDelayInput("");
    setDelayResult(null);
    setDelayError(null);
  }

  async function handleRunSimulation(e) {
    e.stopPropagation();
    setDelayError(null);
    setDelayResult(null);
    const trimmed = delayInput.trim();
    if (!trimmed) {
      setDelayError("Enter a delay in days.");
      return;
    }
    const parsed = Number(trimmed);
    if (!Number.isInteger(parsed)) {
      setDelayError("Delay must be a whole number of days.");
      return;
    }
    if (parsed === 0) {
      setDelayError("Enter a non-zero number of days.");
      return;
    }
    setDelayLoading(true);
    try {
      const result = await onSimulateDelay(task.id, parsed);
      setDelayResult({ deltaDays: parsed, affected: result.affected_tasks || {} });
    } catch (err) {
      setDelayError(err.message || "Could not simulate delay");
    } finally {
      setDelayLoading(false);
    }
  }

  function delayTitle(taskId) {
    return allTasks.find((t) => t.id === taskId)?.title || taskId;
  }

  function formatShift(days) {
    return days > 0 ? `+${days}d` : `${days}d`;
  }

  async function handleToggleBreakdown(e) {
    e.stopPropagation();
    if (showBreakdown) {
      setShowBreakdown(false);
      return;
    }
    setShowBreakdown(true);
    setBreakdownError(null);
    if (breakdown) return;
    setLoadingBreakdown(true);
    try {
      const result = await onRequestBreakdown(task.id);
      setBreakdown(result);
    } catch (err) {
      setBreakdownError(err.message || "Could not fetch breakdown");
    } finally {
      setLoadingBreakdown(false);
    }
  }

  const depCount = (task.prerequisite_ids || []).length;
  const statusKey = (task.status || "Ready").toLowerCase();

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`task-card task-card-status-${statusKey} ${isCriticalPath ? "task-card-critical" : ""} ${isDragging ? "task-card-dragging" : ""}`}
    >
      <div className="task-card-header">
        <strong>
          {task.title}
          {isCriticalPath && <span className="critical-path-badge">◆ Critical</span>}
        </strong>
        <span className={`status-badge status-${statusKey}`}>{task.status}</span>
      </div>

      <div className="task-meta">
        <span className="meta-pill" title="Estimated duration">⏱ {task.duration_days ?? 1}d</span>
        {depCount > 0 && <span className="meta-pill" title="Prerequisites">⛓ {depCount} dep{depCount === 1 ? "" : "s"}</span>}
      </div>

      {task.description && <p className="task-desc">{task.description}</p>}

      {prerequisiteTitles.length > 0 && (
        <div className="dep-chips">
          {prerequisiteTitles.map((title) => (
            <span key={title} className="chip chip-dependency">{title}</span>
          ))}
        </div>
      )}

      <div className="card-actions">
        <button className="suggest-btn ai-btn" onClick={handleGetSuggestions} disabled={loadingSuggestions} title="Ask AI for prerequisite suggestions">
          {loadingSuggestions ? "✨ Thinking..." : "✨ Suggest deps"}
        </button>
        <button className="suggest-btn ai-btn" onClick={handleToggleBreakdown} disabled={loadingBreakdown} title="Ask AI to break this task into subtasks">
          {loadingBreakdown ? "🧩 Working..." : showBreakdown ? "🧩 Hide breakdown" : "🧩 Breakdown"}
        </button>
        {!showDelayForm && (
          <button className="suggest-btn" onClick={handleOpenDelayForm} title="Preview how a delay would propagate">
            ⏱ Simulate delay
          </button>
        )}
      </div>

      {error && <div className="error-msg">{error}</div>}

      {suggestions && suggestions.length === 0 && (
        <div className="no-suggestions">No suggested prerequisites.</div>
      )}

      {suggestions && suggestions.length > 0 && (
        <div className="suggestions-list">
          {suggestions.map((s) => (
            <div key={s.task_id} className="chip chip-suggested">
              <span title={s.justification}>{s.task_title}</span>
              <button onClick={(e) => handleAccept(s, e)}>Accept</button>
            </div>
          ))}
        </div>
      )}

      {showBreakdown && (
        <div
          className="inline-panel"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="inline-panel-title">
            🧩 AI Task Breakdown — advisory preview, nothing was added to the board
          </div>
          {breakdownError && <div className="error-msg">{breakdownError}</div>}
          {loadingBreakdown && <div className="no-suggestions">Generating subtasks...</div>}
          {breakdown && (!breakdown.subtasks || breakdown.subtasks.length === 0) && !breakdownError && (
            <div className="no-suggestions">No subtasks suggested.</div>
          )}
          {breakdown && breakdown.subtasks && breakdown.subtasks.length > 0 && (
            <div className="subtask-list">
              {breakdown.subtasks.map((s, i) => (
                <div key={i} className="subtask-item">
                  <strong>{i + 1}. {s.title}</strong>
                  {s.description && <span>{s.description}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showDelayForm && (
        <div
          className="inline-panel"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="inline-panel-title">
            ⏱ Simulate Delay — preview only, schedule is not changed
          </div>
          <div className="delay-input-row">
            <input
              className="delay-input"
              placeholder="Days (e.g. 3)"
              value={delayInput}
              onChange={(e) => setDelayInput(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              aria-label="Delay in days"
            />
            <button className="suggest-btn" onClick={handleRunSimulation} disabled={delayLoading}>
              {delayLoading ? "Simulating..." : "Run"}
            </button>
            <button className="suggest-btn" onClick={handleCloseDelayForm} disabled={delayLoading}>
              Close
            </button>
          </div>

          {delayError && <div className="error-msg">{delayError}</div>}

          {delayResult && (
            <div>
              <div>
                <strong>{task.title}</strong> {formatShift(delayResult.deltaDays)} (preview)
              </div>
              {Object.keys(delayResult.affected).length === 0 ? (
                <div className="no-suggestions">No downstream tasks affected.</div>
              ) : (
                <div className="dep-chips">
                  {Object.entries(delayResult.affected).map(([tid, shift]) => (
                    <span key={tid} className="chip chip-dependency">
                      {delayTitle(tid)}: {formatShift(shift)}
                    </span>
                  ))}
                </div>
              )}
              <div className="inline-panel-note">Simulation preview — no dates were modified.</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
