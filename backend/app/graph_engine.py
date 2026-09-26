from collections import deque
def build_adjacency(task_ids,edges):
    forward={tid:set() for tid in task_ids}; reverse={tid:set() for tid in task_ids}
    for a,b in edges: forward[a].add(b); reverse[b].add(a)
    return forward,reverse
def creates_cycle(forward,from_id,to_id):
    if from_id==to_id:return True
    seen=set();q=deque([to_id])
    while q:
        n=q.popleft()
        if n==from_id:return True
        if n in seen:continue
        seen.add(n)
        for x in forward.get(n,()):
            if x not in seen:q.append(x)
    return False
def topological_order(task_ids,forward):
    indegree={t:0 for t in task_ids}
    for a in forward:
        for b in forward[a]:indegree[b]+=1
    q=deque([t for t in task_ids if indegree[t]==0]);order=[]
    while q:
        n=q.popleft();order.append(n)
        for x in forward.get(n,()):
            indegree[x]-=1
            if indegree[x]==0:q.append(x)
    if len(order)!=len(task_ids):raise ValueError("Graph contains a cycle - topological sort is undefined")
    return order
def propagate_shift(task_ids,forward,reverse,changed_task_id,delta_days):
    order=topological_order(task_ids,forward);shift={t:0 for t in task_ids};shift[changed_task_id]=delta_days
    start=order.index(changed_task_id)
    for node in order[start+1:]:
        preds=reverse.get(node,())
        if preds:shift[node]=max(shift[p] for p in preds)
    return {t:s for t,s in shift.items() if s!=0}
def compute_blocked_status(task_ids,reverse,task_status_by_id):
    result={}
    for tid in task_ids:
        preds=reverse.get(tid,())
        result[tid]="Ready" if not preds or all(task_status_by_id.get(p)=="Done" for p in preds) else "Blocked"
    return result
def critical_path(task_ids,forward,duration_by_id):
    order=topological_order(task_ids,forward);reverse={t:set() for t in task_ids}
    for a in forward:
        for b in forward[a]:reverse[b].add(a)
    best={t:duration_by_id.get(t,0) for t in task_ids};prev={t:None for t in task_ids}
    for node in order:
        for pred in reverse.get(node,()):
            c=best[pred]+duration_by_id.get(node,0)
            if c>best[node]:best[node]=c;prev[node]=pred
    end=max(best,key=lambda t:best[t]) if task_ids else None
    if end is None:return [],0
    path=[];node=end
    while node is not None:path.append(node);node=prev[node]
    path.reverse();return path,best[end]
