from app.agents.interview_graph import after_evaluate, route_turn


def test_route_turn_created_goes_opening():
    assert route_turn({"status": "created"}) == "opening"


def test_route_turn_answering_goes_evaluate():
    assert route_turn({"status": "answering"}) == "evaluate_answer"


def test_route_turn_finishing_goes_report():
    assert route_turn({"status": "finishing"}) == "report"


def test_route_turn_finished_ends():
    assert route_turn({"status": "finished"}) == "end"


def test_after_evaluate_report_at_max_rounds():
    assert after_evaluate({"round": 8, "max_rounds": 8, "last_evaluation": {}}) == "report"


def test_after_evaluate_probe_when_needed():
    state = {
        "round": 2,
        "max_rounds": 8,
        "follow_up_depth": 0,
        "last_evaluation": {"needs_follow_up": True},
    }
    assert after_evaluate(state) == "probe"


def test_after_evaluate_no_probe_beyond_depth_limit():
    state = {
        "round": 2,
        "max_rounds": 8,
        "follow_up_depth": 2,
        "last_evaluation": {"needs_follow_up": True},
    }
    assert after_evaluate(state) == "next_question"


def test_after_evaluate_next_question_default():
    state = {
        "round": 2,
        "max_rounds": 8,
        "follow_up_depth": 0,
        "last_evaluation": {"needs_follow_up": False},
    }
    assert after_evaluate(state) == "next_question"
