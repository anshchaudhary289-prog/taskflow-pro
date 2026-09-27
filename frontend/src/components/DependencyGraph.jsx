const NODE_W = 168;
const NODE_H = 66;
const X_GAP = 84;
const Y_GAP = 22;

function truncate(title, max = 22) {
  if (!title) return "Untitled";
  return title.length > max ? `${title.slice(0, max - 1)}…` : title;
}

export default function DependencyGraph({ tasks, criticalPathIds }) {
  if (!tasks || tasks.length === 0) {
    return <div className="no-suggestions">No tasks to display.</div>;
  }

  const taskById = new Map(tasks.map((t) => [t.id, t]));

  // Build edges only when both endpoints exist (missing IDs skipped gracefully).
  const edges = [];
  for (const t of tasks) {
    for (const pid of t.prerequisite_ids || []) {
      if (taskById.has(pid) && taskById.has(t.id)) {
        edges.push({ from: pid, to: t.id });
      }
    }
  }

  if (edges.length === 0) {
    return <div className="no-suggestions">No dependencies yet — add a dependency to see the graph.</div>;
  }

  // Depth via Kahn's topological pass (longest path from roots).
  const outgoing = new Map(tasks.map((t) => [t.id, []]));
  const indegree = new Map(tasks.map((t) => [t.id, 0]));
  for (const { from, to } of edges) {
    outgoing.get(from).push(to);
    indegree.set(to, (indegree.get(to) || 0) + 1);
  }

  const depth = new Map(tasks.map((t) => [t.id, 0]));
  const queue = tasks.filter((t) => (indegree.get(t.id) || 0) === 0).map((t) => t.id);
  const seen = new Set();
  while (queue.length > 0) {
    const node = queue.shift();
    if (seen.has(node)) continue;
    seen.add(node);
    for (const nxt of outgoing.get(node) || []) {
      depth.set(nxt, Math.max(depth.get(nxt) || 0, (depth.get(node) || 0) + 1));
      indegree.set(nxt, indegree.get(nxt) - 1);
      if (indegree.get(nxt) <= 0) queue.push(nxt);
    }
  }
  // Nodes in a cycle (shouldn't happen — backend rejects them) keep depth 0.
  const maxDepth = Math.max(0, ...depth.values());

  const layers = new Map();
  for (const t of tasks) {
    const d = depth.get(t.id) || 0;
    if (!layers.has(d)) layers.set(d, []);
    layers.get(d).push(t.id);
  }
  for (const [, ids] of layers) ids.sort();

  const pos = new Map();
  for (const [d, ids] of layers) {
    ids.forEach((id, i) => {
      pos.set(id, {
        x: X_GAP + d * (NODE_W + X_GAP),
        y: Y_GAP + i * (NODE_H + Y_GAP),
      });
    });
  }

  const maxLayerLen = Math.max(...[...layers.values()].map((ids) => ids.length));
  const width = (maxDepth + 1) * (NODE_W + X_GAP) + X_GAP;
  const height = maxLayerLen * (NODE_H + Y_GAP) + Y_GAP + 8;

  function nodeStyle(task) {
    const isCritical = criticalPathIds ? criticalPathIds.has(task.id) : false;
    const isBlocked = task.status === "Blocked";
    return {
      fill: isCritical ? "#fffbeb" : isBlocked ? "#fdeeee" : "#ffffff",
      stroke: isCritical ? "#d97706" : isBlocked ? "#b91c1c" : "#93a5cc",
      strokeWidth: isCritical ? 3 : 1.5,
    };
  }

  return (
    <div>
      <div className="graph-legend">
        <span>
          <span className="graph-swatch" style={{ background: "#fff", border: "1.5px solid #94a3b8" }} />
          Normal
        </span>
        <span>
          <span className="graph-swatch" style={{ background: "#fdeeee", border: "1.5px solid #b91c1c" }} />
          Blocked
        </span>
        <span>
          <span className="graph-swatch" style={{ background: "#fffbeb", border: "2px solid #d97706" }} />
          Critical Path
        </span>
        <span>Arrows point from prerequisite → dependent</span>
      </div>
      <div className="graph-wrap">
        <svg width={width} height={height} role="img" aria-label="Task dependency graph">
          <defs>
            <marker id="dep-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#3b82f6" />
            </marker>
          </defs>
          {edges.map(({ from, to }, i) => {
            const a = pos.get(from);
            const b = pos.get(to);
            if (!a || !b) return null;
            const x1 = a.x + NODE_W;
            const y1 = a.y + NODE_H / 2;
            const x2 = b.x;
            const y2 = b.y + NODE_H / 2;
            const isEdgeCritical =
              criticalPathIds && criticalPathIds.has(from) && criticalPathIds.has(to);
            return (
              <line
                key={`${from}->${to}-${i}`}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={isEdgeCritical ? "#d97706" : "#93a5cc"}
                strokeWidth={isEdgeCritical ? 2.5 : 1.5}
                markerEnd="url(#dep-arrow)"
              />
            );
          })}
          {tasks.map((t) => {
            const p = pos.get(t.id);
            if (!p) return null;
            const s = nodeStyle(t);
            const isCritical = criticalPathIds ? criticalPathIds.has(t.id) : false;
            return (
              <g key={t.id}>
                <rect
                  x={p.x}
                  y={p.y}
                  width={NODE_W}
                  height={NODE_H}
                  rx="10"
                  fill={s.fill}
                  stroke={s.stroke}
                  strokeWidth={s.strokeWidth}
                />
                {isCritical && (
                  <circle cx={p.x + NODE_W - 12} cy={p.y + 12} r="7" fill="#d97706" />
                )}
                {isCritical && (
                  <text x={p.x + NODE_W - 12} y={p.y + 15.5} fontSize="9" fontWeight="800" fill="#fff" textAnchor="middle">★</text>
                )}
                <text x={p.x + 12} y={p.y + 24} fontSize="12" fontWeight="700" fill="#101c36">
                  {truncate(t.title)}
                  <title>{t.title}</title>
                </text>
                <text x={p.x + 12} y={p.y + 41} fontSize="10" fill="#5d6c8a">
                  {t.status || ""}{t.duration_days ? ` · ${t.duration_days}d` : ""}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
