import { useDroppable } from "@dnd-kit/core";
import TaskCard from "./TaskCard.jsx";

const DOT_CLASS = {
  "Backlog": "backlog",
  "In Progress": "inprogress",
  "Review": "review",
  "Done": "done",
};

export default function Column({ column, tasks, allTasks, onAcceptSuggestion, onRequestSuggestions, onSimulateDelay, onRequestBreakdown, criticalPathIds }) {
  const { setNodeRef, isOver } = useDroppable({ id: column });

  return (
    <div
      ref={setNodeRef}
      className={`column ${isOver ? "column-drag-over" : ""}`}
    >
      <h3>
        <span className={`col-dot ${DOT_CLASS[column] || "backlog"}`} />
        {column}
        <span className="count">{tasks.length}</span>
      </h3>
      {tasks.length === 0 && (
        <div className="column-empty">Drop tasks here</div>
      )}
      {tasks.map((task) => (
        <TaskCard
          key={task.id}
          task={task}
          allTasks={allTasks}
          onAcceptSuggestion={onAcceptSuggestion}
          onRequestSuggestions={onRequestSuggestions}
          onSimulateDelay={onSimulateDelay}
          onRequestBreakdown={onRequestBreakdown}
          isCriticalPath={criticalPathIds ? criticalPathIds.has(task.id) : false}
        />
      ))}
    </div>
  );
}
