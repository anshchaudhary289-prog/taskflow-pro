const NODE_W = 160;
const NODE_H = 56;
const X_GAP = 80;
const Y_GAP = 24;

function truncate(title, max = 20) {
  if (!title) return "Untitled";
  return title.length > max ? `${title.slice(0, max - 1)}…` : title;
}

export default function DependencyGraph({ tasks, criticalPathIds }) {
  if (!tasks || tasks.length === 0) return <div className="no-suggestions">No tasks to display.</div>;

  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const edges = [];
  for (const t of tasks) {
    for (const pid of t.prerequisite_ids || []) {
      if (taskById.has(pid)) edges.push({ from: pid, to: t.id });
    }
  }
  if (edges.length === 0) return <div className="no-suggestions">No dependencies yet — add a dependency to see the graph.</div>;

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
    ids.forEach((id, i) => pos.set(id, { x: X_GAP + d * (NODE_W + X_GAP), y: Y_GAP + i * (NODE_H + Y_GAP) }));
  }

  const maxLayerLen = Math.max(...[...layers.values()].map((ids) => ids.length));
  const width = (maxDepth + 1) * (NODE_W + X_GAP) + X_GAP;
  const height = maxLayerLen * (NODE_H + Y_GAP) + Y_GAP + 8;

  return (
    <div>
      <div style={{ display: "flex", gap: "0.8rem", flexWrap: "wrap", fontSize: "0.75rem", marginBottom: "0.5rem" }}>
        <span>Normal</span><span>Blocked</span><span>Critical Path</span>
        <span style={{ color: "#888" }}>Arrows point from prerequisite → dependent</span>
      </div>
      <div style={{ overflowX: "auto", background: "#fff", border: "1px solid #e5e7eb", borderRadius: "8px", padding: "0.5rem" }}>
        <svg width={width} height={height} role="img" aria-label="Task dependency graph">
          <defs><marker id="dep-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#64748b" /></marker></defs>
          {edges.map(({ from, to }, i) => {
            const a = pos.get(from), b = pos.get(to);
            if (!a || !b) return null;
            return <line key={`${from}->${to}-${i}`} x1={a.x + NODE_W} y1={a.y + NODE_H / 2} x2={b.x} y2={b.y + NODE_H / 2} stroke="#64748b" strokeWidth="1.5" markerEnd="url(#dep-arrow)" />;
          })}
          {tasks.map((t) => {
            const p = pos.get(t.id);
            if (!p) return null;
            const critical = criticalPathIds?.has(t.id);
            const blocked = t.status === "Blocked";
            return <g key={t.id}>
              <rect x={p.x} y={p.y} width={NODE_W} height={NODE_H} rx="8"
                fill={critical ? "#fffbeb" : blocked ? "#fee2e2" : "#ffffff"}
                stroke={critical ? "#d97706" : blocked ? "#991b1b" : "#94a3b8"}
                strokeWidth={critical ? 3 : 1.5}/>
              <text x={p.x + 10} y={p.y + 22} fontSize="12" fontWeight="600" fill="#111827">{truncate(t.title)}<title>{t.title}</title></text>
              <text x={p.x + 10} y={p.y + 40} fontSize="10" fill="#6b7280">{t.status || ""} · {t.duration_days}d</text>
            </g>;
          })}
        </svg>
      </div>
    </div>
  );
}
