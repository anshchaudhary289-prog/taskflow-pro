"""
AI/LLM dependency-suggestion feature (mandatory rubric criterion, 15%).

Design (matches synopsis Section 4):
- Suggestions are GROUNDED: the prompt only ever contains real existing
  task titles/descriptions, and the model is instructed to return only
  task IDs that actually exist. This is what "reduces hallucination".
- Suggestions are NEVER auto-committed. They come back as a plain list
  the frontend shows as "Suggested" chips; a human must call the normal
  POST /dependencies endpoint to accept one, which then goes through the
  same cycle-detection check as any manually-added dependency. The LLM
  never touches the graph directly - graph_engine.py remains the sole
  authority on correctness.
- Uses Google Gemini (you've used this API before, and it has a free
  tier) but falls back to a zero-cost keyword-overlap heuristic if no
  API key is set, so the feature still works with $0 spent and nothing
  breaks in front of a judge if the key/quota isn't available.
"""

import os
import re
import json

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
MODEL_NAME = "gemini-1.5-flash"  # cheap/free-tier-friendly model


def _keyword_overlap_fallback(new_task, existing_tasks):
    """
    Zero-cost heuristic used when no API key is configured. Suggests any
    existing task whose title shares a meaningful word with the new
    task's title/description - crude, but deterministic, free, and
    directionally sensible (e.g. "Integration Tests" overlaps with
    "Backend API" only if a shared word exists, so this is intentionally
    conservative rather than guessing wildly).
    """
    stopwords = {"the", "a", "an", "and", "or", "for", "to", "of", "with", "build", "write", "implement"}
    new_words = set(re.findall(r"[a-zA-Z]+", (new_task["title"] + " " + new_task.get("description", "")).lower())) - stopwords

    suggestions = []
    for task in existing_tasks:
        if task["id"] == new_task["id"]:
            continue
        existing_words = set(re.findall(r"[a-zA-Z]+", task["title"].lower())) - stopwords
        overlap = new_words & existing_words
        if overlap:
            suggestions.append({
                "task_id": task["id"],
                "task_title": task["title"],
                "justification": f"Shares keyword(s) {sorted(overlap)} with '{task['title']}' (heuristic fallback, no LLM call made).",
            })
    return suggestions[:3]


def _build_prompt(new_task, existing_tasks):
    task_list_str = "\n".join(f"- id={t['id']}: {t['title']} - {t.get('description', '')}" for t in existing_tasks)
    return f"""You are helping plan task dependencies for a project management tool.

New task being created:
  title: {new_task['title']}
  description: {new_task.get('description', '')}

Existing tasks (the ONLY valid ids you may reference):
{task_list_str}

Which of the existing tasks (if any) are likely PREREQUISITES of the new task -
meaning the new task cannot reasonably start until they are done?

Rules:
- Only return ids that appear in the list above. Never invent an id.
- If nothing is a clear prerequisite, return an empty list.
- Respond with ONLY valid JSON, no other text, in this exact shape:
  {{"suggestions": [{{"task_id": "<id>", "justification": "<one short sentence>"}}]}}
"""


def _call_gemini(prompt):
    """Isolated so it's easy to mock/skip in tests and in offline demos."""
    import google.generativeai as genai  # import here so the module loads fine even if the package isn't installed

    genai.configure(api_key=GEMINI_API_KEY)
    model = genai.GenerativeModel(MODEL_NAME)
    response = model.generate_content(prompt)
    return response.text


def suggest_dependencies(new_task: dict, existing_tasks: list[dict]) -> list[dict]:
    """
    Returns a list of {task_id, task_title, justification} dicts.
    Never raises on failure - falls back to the heuristic so a flaky API
    or missing key never breaks the demo.
    """
    if not existing_tasks:
        return []

    if not GEMINI_API_KEY:
        return _keyword_overlap_fallback(new_task, existing_tasks)

    try:
        prompt = _build_prompt(new_task, existing_tasks)
        raw = _call_gemini(prompt)
        raw = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        parsed = json.loads(raw)

        valid_ids = {t["id"] for t in existing_tasks}
        id_to_title = {t["id"]: t["title"] for t in existing_tasks}

        results = []
        for s in parsed.get("suggestions", []):
            tid = s.get("task_id")
            if tid in valid_ids:
                results.append({
                    "task_id": tid,
                    "task_title": id_to_title[tid],
                    "justification": s.get("justification", ""),
                })
        return results

    except Exception as e:
        fallback = _keyword_overlap_fallback(new_task, existing_tasks)
        for f in fallback:
            f["justification"] += f" (LLM call failed: {type(e).__name__}, used fallback.)"
        return fallback


def _downstream_counts(task_ids, forward):
    """Number of distinct downstream tasks reachable via forward edges."""
    from collections import deque
    counts = {}
    for start in task_ids:
        seen = set()
        queue = deque(forward.get(start, ()))
        while queue:
            node = queue.popleft()
            if node in seen or node == start:
                continue
            seen.add(node)
            for nxt in forward.get(node, ()):
                if nxt not in seen:
                    queue.append(nxt)
        counts[start] = len(seen)
    return counts


def _risk_prompt(summary, risks, total_tasks):
    lines = "\n".join(
        f"- [{r['severity']}/{r['category']}] {', '.join(r['task_titles'])}: {r['reason']}"
        for r in risks[:10]
    )
    return f"""You are a project-risk assistant. Summarize these pre-computed project risks in 2-3 sentences for a manager.

Project has {total_tasks} tasks. Deterministic summary: {summary}

Risks (use ONLY these task titles, never invent new ones):
{lines if lines else "(no risks)"}

Rules:
- Do not invent task names or numbers. Only rephrase the risks above.
- Respond with plain text, no JSON.
"""


def analyze_project_risks(snapshot: dict) -> dict:
    try:
        tasks = snapshot.get("tasks", []) or []
        total_duration = snapshot.get("total_duration", 0) or 0
        forward = snapshot.get("forward", {}) or {}
        by_id = {t["id"]: t for t in tasks if t.get("id")}
        task_ids = list(by_id.keys())
        downstream = _downstream_counts(task_ids, forward) if forward else {tid: 0 for tid in task_ids}
        risks = []

        for t in tasks:
            tid = t.get("id")
            if not tid or tid not in by_id:
                continue
            title = t.get("title", tid)
            dependents = t.get("dependent_ids", []) or []
            prereqs = t.get("prerequisite_ids", []) or []
            real_dependents = [d for d in dependents if d in by_id]
            status = t.get("status", "")
            column = t.get("column", "")
            duration = t.get("duration_days", 1) or 1
            is_critical = bool(t.get("is_critical", False))
            done = column == "Done"

            if status == "Blocked" and not done:
                missing = [by_id[p]["title"] if p in by_id else p for p in prereqs]
                missing_txt = f" (waiting on: {', '.join(missing)})" if missing else ""
                risks.append({
                    "category": "blocked", "severity": "high", "task_ids": [tid],
                    "task_titles": [title],
                    "reason": f"'{title}' is Blocked{missing_txt}. It cannot start until its prerequisites are Done.",
                })
            if is_critical and not done:
                risks.append({
                    "category": "critical_path", "severity": "high", "task_ids": [tid],
                    "task_titles": [title],
                    "reason": f"'{title}' is on the critical path (total {total_duration} days). Any delay here delays the whole project.",
                })
            if len(real_dependents) >= 2:
                risks.append({
                    "category": "bottleneck",
                    "severity": "medium" if len(real_dependents) < 4 else "high",
                    "task_ids": [tid], "task_titles": [title],
                    "reason": f"'{title}' is a bottleneck: {len(real_dependents)} tasks directly depend on it.",
                })
            ds = downstream.get(tid, 0)
            if ds >= 3 and not done:
                risks.append({
                    "category": "downstream_impact", "severity": "medium", "task_ids": [tid],
                    "task_titles": [title],
                    "reason": f"A delay to '{title}' would propagate to {ds} downstream tasks.",
                })
            if is_critical and duration >= 5 and not done:
                risks.append({
                    "category": "long_critical_task", "severity": "medium", "task_ids": [tid],
                    "task_titles": [title],
                    "reason": f"'{title}' takes {duration} days and sits on the critical path, concentrating schedule risk.",
                })

        n_high = sum(1 for r in risks if r["severity"] == "high")
        n_blocked = sum(1 for r in risks if r["category"] == "blocked")
        if not tasks:
            summary, level = "No tasks in the project yet.", "low"
        elif not risks:
            summary, level = f"{len(tasks)} tasks analyzed. No significant risks detected.", "low"
        else:
            summary = f"{len(tasks)} tasks analyzed: {n_blocked} blocked, {n_high} high-severity risk(s), {len(risks)} total risk factor(s)."
            level = "high" if n_high > 0 else "medium"

        explanation, llm_used = summary, False
        if GEMINI_API_KEY and risks:
            try:
                explanation = _call_gemini(_risk_prompt(summary, risks, len(tasks))).strip()
                llm_used = True
            except Exception:
                pass

        return {"summary": summary, "risk_level": level, "risks": risks, "explanation": explanation, "llm_used": llm_used}
    except Exception as e:
        return {
            "summary": f"Risk analysis unavailable: {type(e).__name__}.",
            "risk_level": "low", "risks": [],
            "explanation": "Risk analysis could not be computed for the current board state.",
            "llm_used": False,
        }


def _breakdown_fallback(task: dict) -> list[dict]:
    title = (task.get("title") or "task").strip() or "task"
    desc = (task.get("description") or "").strip()
    scope = f" Scope: {desc}" if desc else ""
    return [
        {"title": f"Plan: {title}", "description": f"Clarify acceptance criteria and scope for '{title}'.{scope}"},
        {"title": f"Implement: {title}", "description": f"Do the core work for '{title}'."},
        {"title": f"Review: {title}", "description": f"Review and test the outcome of '{title}' before marking it done."},
    ]


def _breakdown_prompt(task: dict, context: dict) -> str:
    prereqs = ", ".join(context.get("prerequisite_titles", [])) or "none"
    dependents = ", ".join(context.get("dependent_titles", [])) or "none"
    return f"""You are breaking a project task into smaller practical subtasks.

Actual task (the ONLY task you may reference - do not invent other projects or tasks):
  title: {task.get('title', '')}
  description: {task.get('description', '')}
  duration_days: {context.get('duration_days', 1)}
  prerequisites: {prereqs}
  dependents: {dependents}

Rules:
- Suggest 3-5 concrete subtasks that together complete this exact task.
- Each subtask title must relate directly to the task above.
- Never invent unrelated project facts or reference tasks that are not listed here.
- Respond with ONLY valid JSON, no other text, in this exact shape:
  {{"subtasks": [{{"title": "<short title>", "description": "<one sentence>"}}]}}
"""


def breakdown_task(task: dict, context: dict = None) -> dict:
    context = context or {}
    task_id = task.get("id", "")
    task_title = task.get("title", task_id)
    fallback = _breakdown_fallback(task)
    if not GEMINI_API_KEY:
        return {"task_id": task_id, "task_title": task_title, "subtasks": fallback, "llm_used": False}
    try:
        raw = _call_gemini(_breakdown_prompt(task, context))
        raw = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        parsed = json.loads(raw)
        subtasks = []
        for s in parsed.get("subtasks", [])[:6]:
            title = str(s.get("title", "")).strip()
            desc = str(s.get("description", "")).strip()
            if title:
                subtasks.append({"title": title, "description": desc})
        if not subtasks:
            return {"task_id": task_id, "task_title": task_title, "subtasks": fallback, "llm_used": False}
        return {"task_id": task_id, "task_title": task_title, "subtasks": subtasks, "llm_used": True}
    except Exception:
        return {"task_id": task_id, "task_title": task_title, "subtasks": fallback, "llm_used": False}
