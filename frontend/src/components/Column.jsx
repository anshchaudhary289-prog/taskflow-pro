import { useDroppable } from "@dnd-kit/core";
import TaskCard from "./TaskCard.jsx";

export default function Column({ column, tasks, allTasks, onAcceptSuggestion, onRequestSuggestions, onSimulateDelay, onRequestBreakdown, criticalPathIds }) {
  const { setNodeRef, isOver } = useDroppable({ id: column });
  return (
    <div ref={setNodeRef} className="column" style={{ background: isOver ? "#eef6ff" : undefined }}>
      <h3>{column} <span className="count">({tasks.length})</span></h3>
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
