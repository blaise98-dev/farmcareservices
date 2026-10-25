"""
Unit tests for the field logic, checked against readings from the demo video
(Kanyinya cowshed, Aug 2026). Run: venv/bin/python -m pytest tests -q
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from alerting import subscriber_matches            # noqa: E402
from farm_config import milk_level, milking_session_name  # noqa: E402
from health_risk import distance_m, risk_level, score_cow  # noqa: E402
from routers.barn import feed_consumed              # noqa: E402

EMPTY, FULL, CAP = 18.0, 1.0, 4.0


def test_milk_level_matches_video_readings():
    # (distance cm, % shown, litres shown) from the Milking page in the video
    for dist, pct, litres in [(16.5, 9, 0.353), (2.6, 91, 3.624), (3.9, 83, 3.318), (20.0, 0, 0.0)]:
        got_pct, got_l = milk_level(dist, EMPTY, FULL, CAP)
        assert abs(got_pct - pct) <= 1.5, (dist, got_pct)
        assert abs(got_l - litres) <= 0.06, (dist, got_l)


def test_milk_level_bad_input():
    assert milk_level(None, EMPTY, FULL, CAP) == (None, None)
    assert milk_level(-1, EMPTY, FULL, CAP) == (None, None)
    assert milk_level(5, 1.0, 18.0, CAP) == (None, None)      # empty must be farther than full
    assert milk_level(0.2, EMPTY, FULL, CAP) == (100.0, 4.0)   # above the full mark clamps


def test_session_names():
    assert milking_session_name(6) == "Morning"
    assert milking_session_name(12) == "Midday"
    assert milking_session_name(17) == "Evening"


def test_risk_reproduces_video_case():
    # Kibumba: 31.9 °C, 60 bpm, 96 %, 14-day average 29.5 °C -> "At Risk · 55"
    history = [29.5 + d for d in (-0.9, 0.9) * 15]          # mean 29.5, sigma 0.9
    r = score_cow(31.9, 60, 96, history, [])
    assert r["score"] == 55
    assert r["level"] == "At Risk"
    assert any("hypothermia" in x for x in r["reasons"])
    assert any("2.7σ" in x and "29.5°C" in x for x in r["reasons"])


def test_risk_healthy_cow_is_normal():
    history = [38.6, 38.4, 38.5] * 10
    r = score_cow(38.5, 70, 97, history, [70, 72, 68] * 10)
    assert r["score"] == 0 and r["level"] == "Normal" and r["reasons"] == []


def test_risk_needs_enough_baseline():
    r = score_cow(38.5, 70, 97, [30.0] * 5, [])          # too few readings for a baseline
    assert r["score"] == 0


def test_risk_fever_and_low_spo2():
    r = score_cow(40.1, 110, 88, [], [])
    assert r["score"] == 80 and r["level"] == "Critical"
    assert risk_level(24) == "Normal" and risk_level(25) == "Watch" and risk_level(50) == "At Risk"


def test_feed_consumed_ignores_refills_and_noise():
    weights = [37.10, 37.08, 37.07, 36.97, 36.93, 50.00, 49.80, 49.79]
    # drops counted: 37.07->36.97 (0.10), 50.00->49.80 (0.20); 37.10->37.08 etc. are noise
    assert feed_consumed(weights) == 0.30


def test_distance_m():
    # about 111 m per 0.001 degree of latitude
    d = distance_m(-1.95, 30.00, -1.951, 30.00)
    assert 105 < d < 118


def test_subscriber_filters():
    sub = {"is_active": True, "min_severity": "Warning", "alert_types": "Health, Feed"}
    assert subscriber_matches(sub, "Health", "Critical")
    assert not subscriber_matches(sub, "Health", "Info")
    assert not subscriber_matches(sub, "Water", "Critical")
    assert subscriber_matches({"is_active": True, "min_severity": "Info", "alert_types": "All"}, "Milk", "Info")
    assert not subscriber_matches({"is_active": False, "min_severity": "Info", "alert_types": "All"}, "Milk", "Info")
