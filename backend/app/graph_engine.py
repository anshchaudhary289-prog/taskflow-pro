"""
Core dependency-graph engine for TaskFlow Pro.

Deliberately kept as pure functions operating on plain Python data
structures (dicts / lists / sets of ids) rather than ORM objects, so the
hardest logic in the whole problem - cycle detection and non-compounding
schedule propagation - can be unit tested in complete isolation from the
database and the web framework.

Graph convention:
    An edge (a, b) means "a is a prerequisite of b" (a must be Done
    before b can be Ready). a -> b in the DAG.
"""

from collections import deque


def build_adjacency(task_ids, edges):
    forward = {tid: set() for tid in task_ids}
    reverse = {tid: set() for tid in task_ids}
    for a, b in edges:
        forward[a].add(b)
        reverse[b].add(a)
    return forward, reverse


def creates_cycle(forward, from_id, to_id):
    if from_id == to_id:
        return True
    visited = set()
    queue = deque([to_id])
    while queue:
        node = queue.popleft()
        if node == from_id:
            return True
        if node in visited:
            continue
        visited.add(node)
        for nxt in forward.get(node, ()):
            if nxt not in visited:
                queue.append(nxt)
    return False


def topological_order(task_ids, forward):
    indegree = {tid: 0 for tid in task_ids}
    for a in forward:
        for b in forward[a]:
            indegree[b] += 1
    queue = deque([tid for tid in task_ids if indegree[tid] == 0])
    order = []
    while queue:
        node = queue.popleft()
        order.append(node)
        for nxt in forward.get(node, ()):
            indegree[nxt] -= 1
            if indegree[nxt] == 0:
                queue.append(nxt)
    if len(order) != len(task_ids):
        raise ValueError("Graph contains a cycle - topological sort is undefined")
    return order


def propagate_shift(task_ids, forward, reverse, changed_task_id, delta_days):
    """
    No Compounding: for a diamond, a downstream node receives the maximum
    shift arriving through its prerequisite paths, never the sum.
    """
    order = topological_order(task_ids, forward)
    shift = {tid: 0 for tid in task_ids}
    shift[changed_task_id] = delta_days
    start_index = order.index(changed_task_id)
    for node in order[start_index + 1:]:
        preds = reverse.get(node, ())
        if preds:
            shift[node] = max(shift[p] for p in preds)
    return {tid: s for tid, s in shift.items() if s != 0}


def compute_blocked_status(task_ids, reverse, task_status_by_id):
    status = {}
    for tid in task_ids:
        preds = reverse.get(tid, ())
        if not preds:
            status[tid] = "Ready"
            continue
        all_done = all(task_status_by_id.get(p) == "Done" for p in preds)
        status[tid] = "Ready" if all_done else "Blocked"
    return status


def critical_path(task_ids, forward, duration_by_id):
    order = topological_order(task_ids, forward)
    reverse = {tid: set() for tid in task_ids}
    for a in forward:
        for b in forward[a]:
            reverse[b].add(a)
    best_len = {tid: duration_by_id.get(tid, 0) for tid in task_ids}
    best_prev = {tid: None for tid in task_ids}
    for node in order:
        for pred in reverse.get(node, ()):
            candidate = best_len[pred] + duration_by_id.get(node, 0)
            if candidate > best_len[node]:
                best_len[node] = candidate
                best_prev[node] = pred
    end_node = max(best_len, key=lambda tid: best_len[tid]) if task_ids else None
    if end_node is None:
        return [], 0
    path = []
    node = end_node
    while node is not None:
        path.append(node)
        node = best_prev[node]
    path.reverse()
    return path, best_len[end_node]
