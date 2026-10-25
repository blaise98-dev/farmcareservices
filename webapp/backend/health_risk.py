"""
Per-cow health risk score (0-100), as shown on the Cow Health page.

The score is statistical, not a trained model. It adds points for:
  1. readings outside clinical ranges for dairy cattle (temperature, heart
     rate, SpO2), and
  2. readings that are unusual for that cow, measured in standard deviations
     (sigma) from her own 14-day average.
Every point added comes with a plain-language reason, so a farmer or vet can
see why a cow was flagged. It is an early-warning signal, not a diagnosis.
"""
import math
from statistics import mean, pstdev
from typing import Optional

BASELINE_DAYS = 14
MIN_BASELINE_READINGS = 20
TEMP_SIGMA_FLOOR = 0.2      # °C; stops a very steady sensor turning noise into "unusual"
HR_SIGMA_FLOOR = 3.0        # bpm

HR_LOW, HR_HIGH = 48, 100   # resting dairy cattle ~48-84 bpm
SPO2_LOW, SPO2_WARN = 90, 94


def risk_level(score: int) -> str:
    if score >= 75:
        return "Critical"
    if score >= 50:
        return "At Risk"
    if score >= 25:
        return "Watch"
    return "Normal"


def _baseline(values: list[float], floor: float) -> Optional[tuple[float, float]]:
    vals = [v for v in values if v is not None and not math.isnan(v)]
    if len(vals) < MIN_BASELINE_READINGS:
        return None
    return mean(vals), max(pstdev(vals), floor)


def score_cow(
    temp_c: Optional[float],
    heart_rate: Optional[float],
    spo2: Optional[float],
    temp_history: list[float],
    hr_history: list[float],
    hypothermia_c: float = 37.0,
    high_c: float = 39.0,
    fever_c: float = 39.5,
) -> dict:
    """Return {score, level, reasons[]} for one cow's latest readings."""
    score = 0
    reasons: list[str] = []

    if temp_c is not None:
        if temp_c <= hypothermia_c:
            score += 40
            reasons.append(f"Body temperature {temp_c:.1f}°C is at/below the {hypothermia_c:.1f}°C hypothermia threshold")
        elif temp_c >= fever_c:
            score += 40
            reasons.append(f"Fever: body temperature {temp_c:.1f}°C is at/above {fever_c:.1f}°C")
        elif temp_c >= high_c:
            score += 20
            reasons.append(f"Body temperature {temp_c:.1f}°C is above {high_c:.1f}°C")

    if heart_rate is not None and (heart_rate < HR_LOW or heart_rate > HR_HIGH):
        score += 20
        reasons.append(f"Heart rate {heart_rate:.0f} bpm is outside the {HR_LOW}-{HR_HIGH} bpm range")

    if spo2 is not None:
        if spo2 < SPO2_LOW:
            score += 20
            reasons.append(f"SpO2 {spo2:.0f}% is below {SPO2_LOW}%")
        elif spo2 < SPO2_WARN:
            score += 10
            reasons.append(f"SpO2 {spo2:.0f}% is below {SPO2_WARN}%")

    base = _baseline(temp_history, TEMP_SIGMA_FLOOR)
    if temp_c is not None and base:
        avg, sd = base
        z = (temp_c - avg) / sd
        if abs(z) >= 3:
            score += 25
        elif abs(z) >= 2:
            score += 15
        if abs(z) >= 2:
            reasons.append(f"Body temperature is unusual for her: {abs(z):.1f}σ from her {BASELINE_DAYS}-day average of {avg:.1f}°C")

    base = _baseline(hr_history, HR_SIGMA_FLOOR)
    if heart_rate is not None and base:
        avg, sd = base
        z = (heart_rate - avg) / sd
        if abs(z) >= 3:
            score += 15
        elif abs(z) >= 2:
            score += 10
        if abs(z) >= 2:
            reasons.append(f"Heart rate is unusual for her: {abs(z):.1f}σ from her {BASELINE_DAYS}-day average of {avg:.0f} bpm")

    score = min(100, score)
    return {"score": score, "level": risk_level(score), "reasons": reasons}


def distance_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance in metres (haversine)."""
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))
