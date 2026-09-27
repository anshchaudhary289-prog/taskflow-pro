"""
These tests encode the exact worked examples from the problem statement.
If these pass, the two riskiest requirements (cycle rejection and
non-compounding propagation) are provably correct - run this file first,
before writing a single line of API or UI code.
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.graph_engine import (
    build_adjacency, creates_cycle, topological_order, propagate_shift,
    compute_blocked_status, critical_path,
)


def test_diamond_no_compounding():
    task_ids = ["A", "B", "C", "D"]
    edges = [("A", "B"), ("A", "C"), ("B", "D"), ("C", "D")]
    forward, reverse = build_adjacency(task_ids, edges)
    result = propagate_shift(task_ids, forward, reverse, "A", 3)
    assert result == {"A": 3, "B": 3, "C": 3, "D": 3}


def test_diamond_negative_no_compounding():
    task_ids = ["A", "B", "C", "D"]
    edges = [("A", "B"), ("A", "C"), ("B", "D"), ("C", "D")]
    forward, reverse = build_adjacency(task_ids, edges)
    result = propagate_shift(task_ids, forward, reverse, "A", -3)
    assert result == {"A": -3, "B": -3, "C": -3, "D": -3}


def test_simple_chain_propagation():
    task_ids = ["A", "B", "C"]
    forward, reverse = build_adjacency(task_ids, [("A", "B"), ("B", "C")])
    assert propagate_shift(task_ids, forward, reverse, "B", 2) == {"B": 2, "C": 2}


def test_unaffected_branch_not_shifted():
    task_ids = ["A", "B", "C", "D", "E"]
    forward, reverse = build_adjacency(task_ids, [("A", "B"), ("C", "D")])
    assert propagate_shift(task_ids, forward, reverse, "A", 4) == {"A": 4, "B": 4}


def test_cycle_rejected_direct():
    task_ids = ["A", "B"]
    forward, _ = build_adjacency(task_ids, [("A", "B")])
    assert creates_cycle(forward, "B", "A") is True


def test_cycle_rejected_transitive():
    task_ids = ["A", "B", "C"]
    forward, _ = build_adjacency(task_ids, [("A", "B"), ("B", "C")])
    assert creates_cycle(forward, "C", "A") is True


def test_valid_new_edge_not_flagged_as_cycle():
    task_ids = ["A", "B", "C"]
    forward, _ = build_adjacency(task_ids, [("A", "B")])
    assert creates_cycle(forward, "A", "C") is False


def test_topological_order_respects_dependencies():
    task_ids = ["A", "B", "C", "D"]
    forward, _ = build_adjacency(task_ids, [("A", "B"), ("A", "C"), ("B", "D"), ("C", "D")])
    order = topological_order(task_ids, forward)
    assert order.index("A") < order.index("B")
    assert order.index("A") < order.index("C")
    assert order.index("B") < order.index("D")
    assert order.index("C") < order.index("D")


def test_blocked_ready_status():
    task_ids = ["A", "B", "C"]
    _, reverse = build_adjacency(task_ids, [("A", "B"), ("A", "C")])
    status = compute_blocked_status(task_ids, reverse, {"A": "Done", "B": "Backlog", "C": "Backlog"})
    assert status["B"] == "Ready"
    status = compute_blocked_status(task_ids, reverse, {"A": "In Progress", "B": "Backlog", "C": "Backlog"})
    assert status["B"] == "Blocked"
    assert status["C"] == "Blocked"


def test_critical_path_picks_longer_branch():
    task_ids = ["A", "B", "C", "D"]
    forward, _ = build_adjacency(task_ids, [("A", "B"), ("A", "C"), ("B", "D"), ("C", "D")])
    path, total = critical_path(task_ids, forward, {"A": 1, "B": 5, "C": 1, "D": 1})
    assert path == ["A", "B", "D"]
    assert total == 7
