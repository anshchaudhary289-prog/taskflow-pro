import os,re,json
GEMINI_API_KEY=os.environ.get("GEMINI_API_KEY","")
MODEL_NAME="gemini-1.5-flash"

def fallback_suggestions(new,existing):
    stop={"the","a","an","and","or","for","to","of","with","build","write","implement"}
    words=set(re.findall(r"[a-zA-Z]+",(new["title"]+" "+new.get("description","")).lower()))-stop
    out=[]
    for t in existing:
        overlap=words & (set(re.findall(r"[a-zA-Z]+",t["title"].lower()))-stop)
        if overlap: out.append({"task_id":t["id"],"task_title":t["title"],"justification":"Keyword overlap fallback."})
    return out[:3]

def call_gemini(prompt):
    import google.generativeai as genai
    genai.configure(api_key=GEMINI_API_KEY)
    return genai.GenerativeModel(MODEL_NAME).generate_content(prompt).text

def suggest_dependencies(new,existing):
    if not existing:return []
    if not GEMINI_API_KEY:return fallback_suggestions(new,existing)
    prompt="Find likely prerequisites. New task: "+new["title"]+" - "+new.get("description","")+" Existing tasks, valid IDs only: "+json.dumps(existing)
    try:
        raw=call_gemini(prompt).strip()
        parsed=json.loads(raw)
        valid={t["id"] for t in existing};titles={t["id"]:t["title"] for t in existing}
        return [{"task_id":s["task_id"],"task_title":titles[s["task_id"]],"justification":s.get("justification","")} for s in parsed.get("suggestions",[]) if s.get("task_id") in valid][:3]
    except Exception:return fallback_suggestions(new,existing)

def breakdown_task(task):
    low=task["title"].lower()
    if any(x in low for x in ("api","backend","service")):steps=["Define request/response contract","Implement core service logic","Add validation and error handling","Write integration tests"]
    elif any(x in low for x in ("frontend","ui","page","dashboard")):steps=["Define screen states and user flow","Build the main components","Connect API and loading states","Test responsive and error states"]
    elif any(x in low for x in ("database","db","schema")):steps=["Define entities and relationships","Create schema and constraints","Add seed data","Test queries and edge cases"]
    else:steps=["Clarify acceptance criteria","Implement the core work","Handle failure and edge cases","Test and document the result"]
    return [{"title":s,"reason":"Deterministic planning fallback; no task was created automatically."} for s in steps]

def analyze_risks(tasks,edges,critical):
    ids={t["id"] for t in tasks};forward={i:set() for i in ids};reverse={i:set() for i in ids}
    for a,b in edges:
        if a in ids and b in ids:forward[a].add(b);reverse[b].add(a)
    out=[]
    for t in tasks:
        i=t["id"];reasons=[]
        if i in critical:reasons.append("on the critical path")
        if len(forward[i])>=2:reasons.append("blocks downstream tasks")
        if len(reverse[i])>=2:reasons.append("depends on multiple prerequisites")
        if t.get("duration_days",1)>=5:reasons.append("has a long duration")
        if t.get("status")=="Blocked":reasons.append("is currently blocked")
        if reasons:
            score=min(100,(35 if i in critical else 0)+15*len(forward[i])+10*len(reverse[i])+(20 if t.get("duration_days",1)>=5 else 0)+(20 if t.get("status")=="Blocked" else 0))
            out.append({"task_id":i,"task_title":t["title"],"risk_level":"High" if score>=60 else "Medium","score":score,"reasons":reasons,"recommendation":"Resolve prerequisites and monitor downstream impact." if t.get("status")=="Blocked" else "Monitor this task and simulate delays."})
    return sorted(out,key=lambda x:-x["score"])[:5]

def explain_what_if(title,delta,affected,titles,critical):
    tid=next((k for k,v in titles.items() if v==title),None)
    critical_affected=[titles[i] for i in affected if i in critical]
    direction="later" if delta>0 else "earlier" if delta<0 else "unchanged"
    return {"headline":"Moving "+title+" "+str(abs(delta))+" day(s) "+direction+" affects "+str(len(affected))+" task(s).","recommendation":"Prioritize affected critical-path work." if critical_affected else "No critical-path task is directly affected.","affected_tasks":[titles[i] for i in affected if i!=tid],"critical_affected":critical_affected}
