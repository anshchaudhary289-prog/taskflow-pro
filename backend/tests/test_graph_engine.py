from app.graph_engine import *

def engine():
    ids=list("ABCD")
    return ids,*build_adjacency(ids,[("A","B"),("B","D"),("A","C"),("C","D")])

def test_direct_cycle():
    ids,f,r=engine();assert creates_cycle(f,"D","A")

def test_valid_edge():
    ids,f,r=engine();assert not creates_cycle(f,"A","D")

def test_topological_order():
    ids,f,r=engine();o=topological_order(ids,f);assert o.index("A")<o.index("D")

def test_diamond_positive_no_compounding():
    ids,f,r=engine();assert propagate_shift(ids,f,r,"A",3)=={"A":3,"B":3,"C":3,"D":3}

def test_diamond_negative_no_compounding():
    ids,f,r=engine();assert propagate_shift(ids,f,r,"A",-3)=={"A":-3,"B":-3,"C":-3,"D":-3}

def test_simple_chain():
    ids=list("ABC");f,r=build_adjacency(ids,[("A","B"),("B","C")]);assert propagate_shift(ids,f,r,"B",2)=={"B":2,"C":2}

def test_unrelated_branch():
    ids=list("ABCDE");f,r=build_adjacency(ids,[("A","B"),("C","D")]);assert propagate_shift(ids,f,r,"A",4)=={"A":4,"B":4}

def test_blocked_ready():
    ids,f,r=engine();s=compute_blocked_status(ids,r,{"A":"Done","B":"Done","C":"Done","D":"Backlog"});assert s["D"]=="Ready"

def test_blocked_when_prereq_not_done():
    ids,f,r=engine();s=compute_blocked_status(ids,r,{"A":"Done","B":"Done","C":"Backlog","D":"Backlog"});assert s["D"]=="Blocked"

def test_critical_path():
    ids,f,r=engine();assert critical_path(ids,f,{"A":2,"B":3,"C":1,"D":2})[1]==7
