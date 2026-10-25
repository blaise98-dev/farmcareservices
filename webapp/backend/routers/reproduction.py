from fastapi import APIRouter, Depends, HTTPException
from form_model import FormModel
from typing import Optional
from database import fetchall, fetchone, execute
from rbac import require_any, require_admin_or_vet
from tenancy import farm_clause, cow_clause, ensure_cow_access

router = APIRouter(prefix="/api/reproduction", tags=["reproduction"])


def _safe(row: dict) -> dict:
    if not row:
        return {}
    out = {}
    for k, v in row.items():
        if hasattr(v, "isoformat"):
            out[k] = v.isoformat()
        elif hasattr(v, "__float__"):
            out[k] = float(v)
        else:
            out[k] = v
    return out


async def _ensure_cow_record(user: dict, table: str, key: str, value) -> None:
    """404 unless the record exists and its cow is on a farm the user can see."""
    where, args = cow_clause(user, "cow_id")
    row = await fetchone(f"SELECT {key} FROM {table} WHERE {key}=%s AND {where}", (value, *args))
    if not row:
        raise HTTPException(404, "Record not found")


class ReproEntry(FormModel):
    cow_id: int
    calving_date: Optional[str] = None
    calf_sex: Optional[str] = None
    calf_weight_kg: Optional[float] = None
    insemination_date: Optional[str] = None
    insemination_method: Optional[str] = "AI"
    expected_calving_date: Optional[str] = None
    pregnancy_confirmed: Optional[bool] = False
    notes: Optional[str] = None


class ReproUpdate(FormModel):
    calving_date: Optional[str] = None
    calf_sex: Optional[str] = None
    calf_weight_kg: Optional[float] = None
    insemination_date: Optional[str] = None
    insemination_method: Optional[str] = None
    expected_calving_date: Optional[str] = None
    pregnancy_confirmed: Optional[bool] = None
    notes: Optional[str] = None


@router.get("/")
async def list_all(user=Depends(require_admin_or_vet())):
    """All reproduction records with cow info and computed lactation/gestation days."""
    where, args = farm_clause(user, "c.farm_id")
    rows = await fetchall(
        f"""
        SELECT r.*,
               c.cow_name, c.breed, c.health_status, c.lactating,
               DATEDIFF(CURDATE(), r.calving_date) AS days_in_lactation,
               DATEDIFF(r.expected_calving_date, CURDATE()) AS days_to_calving,
               (SELECT COUNT(*) FROM ReproductionRecords r2
                WHERE r2.cow_id = r.cow_id AND r2.calving_date IS NOT NULL) AS total_calvings
        FROM ReproductionRecords r
        JOIN Cows c ON r.cow_id = c.cow_id
        WHERE c.is_active = TRUE AND {where}
        ORDER BY r.recorded_at DESC
        """,
        args,
    )
    return [_safe(r) for r in rows]


@router.get("/summary")
async def herd_repro_summary(user=Depends(require_admin_or_vet())):
    """Summary: pregnant count, lactating, dry, expected calvings in 30 days."""
    where, args = farm_clause(user, "c.farm_id")
    row = await fetchone(
        f"""
        SELECT
            COUNT(DISTINCT CASE WHEN c.lactating = TRUE THEN c.cow_id END) AS lactating_count,
            COUNT(DISTINCT CASE WHEN c.lactating = FALSE AND c.cow_category = 'Dry' THEN c.cow_id END) AS dry_count,
            COUNT(DISTINCT CASE WHEN r.pregnancy_confirmed = TRUE AND r.calving_date IS NULL THEN r.cow_id END) AS pregnant_count,
            COUNT(DISTINCT CASE WHEN r.expected_calving_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY) THEN r.cow_id END) AS due_30d,
            AVG(CASE WHEN r.calving_date IS NOT NULL THEN DATEDIFF(CURDATE(), r.calving_date) END) AS avg_days_lactation
        FROM Cows c
        LEFT JOIN ReproductionRecords r ON c.cow_id = r.cow_id
        WHERE c.is_active = TRUE AND {where}
        """,
        args,
    )
    return _safe(row) if row else {}


@router.get("/cow/{cow_id}")
async def cow_repro(cow_id: int, user=Depends(require_any())):
    await ensure_cow_access(user, cow_id)
    rows = await fetchall(
        """
        SELECT r.*,
               DATEDIFF(CURDATE(), r.calving_date) AS days_in_lactation,
               DATEDIFF(r.expected_calving_date, CURDATE()) AS days_to_calving
        FROM ReproductionRecords r
        WHERE r.cow_id = %s
        ORDER BY r.recorded_at DESC
        """,
        (cow_id,),
    )
    return [_safe(r) for r in rows]


@router.post("/")
async def add_record(
    body: ReproEntry,
    current_user: dict = Depends(require_admin_or_vet()),
):
    await ensure_cow_access(current_user, body.cow_id)
    rid = await execute(
        """
        INSERT INTO ReproductionRecords
        (cow_id, calving_date, calf_sex, calf_weight_kg, insemination_date,
         insemination_method, expected_calving_date, pregnancy_confirmed, notes, recorded_by)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        """,
        (body.cow_id, body.calving_date, body.calf_sex, body.calf_weight_kg,
         body.insemination_date, body.insemination_method, body.expected_calving_date,
         body.pregnancy_confirmed, body.notes, current_user["username"]),
    )
    return {"ok": True, "repro_id": rid}


@router.patch("/{repro_id}")
async def update_record(
    repro_id: int,
    body: ReproUpdate,
    current_user: dict = Depends(require_admin_or_vet()),
):
    await _ensure_cow_record(current_user, "ReproductionRecords", "repro_id", repro_id)
    fields = {k: v for k, v in body.model_dump().items() if v is not None}
    if not fields:
        raise HTTPException(400, "No fields to update")
    set_clause = ", ".join(f"{k}=%s" for k in fields)
    await execute(
        f"UPDATE ReproductionRecords SET {set_clause} WHERE repro_id=%s",
        list(fields.values()) + [repro_id],
    )
    return {"ok": True}


@router.delete("/{repro_id}")
async def delete_record(
    repro_id: int,
    user=Depends(require_admin_or_vet()),
):
    await _ensure_cow_record(user, "ReproductionRecords", "repro_id", repro_id)
    await execute("DELETE FROM ReproductionRecords WHERE repro_id=%s", (repro_id,))
    return {"ok": True}


# ── Treatments ────────────────────────────────────────────────────────────────

class TreatmentEntry(FormModel):
    cow_id: int
    treatment_date: str
    diagnosis: str
    drug_name: str
    dose: Optional[str] = None
    duration_days: Optional[int] = 1
    notes: Optional[str] = None
    follow_up_date: Optional[str] = None


@router.get("/treatments")
async def list_treatments(user=Depends(require_admin_or_vet())):
    where, args = farm_clause(user, "c.farm_id")
    rows = await fetchall(
        f"""
        SELECT t.*, c.cow_name
        FROM TreatmentRecords t
        JOIN Cows c ON t.cow_id = c.cow_id
        WHERE {where}
        ORDER BY t.treatment_date DESC
        LIMIT 50
        """,
        args,
    )
    return [_safe(r) for r in rows]


@router.get("/treatments/cow/{cow_id}")
async def cow_treatments(cow_id: int, user=Depends(require_any())):
    await ensure_cow_access(user, cow_id)
    rows = await fetchall(
        "SELECT * FROM TreatmentRecords WHERE cow_id=%s ORDER BY treatment_date DESC",
        (cow_id,),
    )
    return [_safe(r) for r in rows]


@router.post("/treatments")
async def add_treatment(
    body: TreatmentEntry,
    current_user: dict = Depends(require_admin_or_vet()),
):
    await ensure_cow_access(current_user, body.cow_id)
    rid = await execute(
        """
        INSERT INTO TreatmentRecords
        (cow_id, treatment_date, diagnosis, drug_name, dose, duration_days,
         notes, follow_up_date, administered_by)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
        """,
        (body.cow_id, body.treatment_date, body.diagnosis, body.drug_name,
         body.dose, body.duration_days, body.notes, body.follow_up_date,
         current_user["username"]),
    )
    return {"ok": True, "treatment_id": rid}


@router.patch("/treatments/{treatment_id}/complete")
async def complete_treatment(
    treatment_id: int,
    user=Depends(require_admin_or_vet()),
):
    await _ensure_cow_record(user, "TreatmentRecords", "treatment_id", treatment_id)
    await execute(
        "UPDATE TreatmentRecords SET is_completed=TRUE WHERE treatment_id=%s",
        (treatment_id,),
    )
    return {"ok": True}


# ── Vaccinations ──────────────────────────────────────────────────────────────

class VaxEntry(FormModel):
    cow_id: int
    vaccine_name: str
    vaccination_date: str
    next_due_date: Optional[str] = None
    batch_number: Optional[str] = None
    notes: Optional[str] = None


@router.get("/vaccinations")
async def list_vaccinations(user=Depends(require_admin_or_vet())):
    where, args = farm_clause(user, "c.farm_id")
    rows = await fetchall(
        f"""
        SELECT v.*, c.cow_name
        FROM VaccinationRecords v
        JOIN Cows c ON v.cow_id = c.cow_id
        WHERE {where}
        ORDER BY v.vaccination_date DESC
        """,
        args,
    )
    return [_safe(r) for r in rows]


@router.get("/vaccinations/due")
async def vaccinations_due(user=Depends(require_admin_or_vet())):
    """Vaccinations due in the next 30 days."""
    where, args = farm_clause(user, "c.farm_id")
    rows = await fetchall(
        f"""
        SELECT v.*, c.cow_name,
               DATEDIFF(v.next_due_date, CURDATE()) AS days_until_due
        FROM VaccinationRecords v
        JOIN Cows c ON v.cow_id = c.cow_id
        WHERE v.next_due_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)
          AND {where}
        ORDER BY v.next_due_date ASC
        """,
        args,
    )
    return [_safe(r) for r in rows]


@router.post("/vaccinations")
async def add_vaccination(
    body: VaxEntry,
    current_user: dict = Depends(require_admin_or_vet()),
):
    await ensure_cow_access(current_user, body.cow_id)
    rid = await execute(
        """
        INSERT INTO VaccinationRecords
        (cow_id, vaccine_name, vaccination_date, next_due_date, batch_number, notes, administered_by)
        VALUES (%s,%s,%s,%s,%s,%s,%s)
        """,
        (body.cow_id, body.vaccine_name, body.vaccination_date,
         body.next_due_date, body.batch_number, body.notes,
         current_user["username"]),
    )
    return {"ok": True, "vax_id": rid}


# ── Body Condition Scores ─────────────────────────────────────────────────────

class BCSEntry(FormModel):
    cow_id:     int
    score:      float        # 1.0–5.0
    notes:      Optional[str] = None


@router.get("/bcs")
async def list_bcs(user=Depends(require_admin_or_vet())):
    """Latest BCS for every active cow."""
    where, args = farm_clause(user, "c.farm_id")
    rows = await fetchall(
        f"""
        SELECT b.*, c.cow_name, c.health_status
        FROM BodyConditionScores b
        JOIN Cows c ON b.cow_id = c.cow_id
        WHERE c.is_active = TRUE AND {where}
          AND b.assessed_at = (
              SELECT MAX(b2.assessed_at)
              FROM BodyConditionScores b2
              WHERE b2.cow_id = b.cow_id
          )
        ORDER BY b.score ASC
        """,
        args,
    )
    return [_safe(r) for r in rows]


@router.get("/bcs/cow/{cow_id}")
async def cow_bcs_history(cow_id: int, user=Depends(require_any())):
    await ensure_cow_access(user, cow_id)
    rows = await fetchall(
        "SELECT * FROM BodyConditionScores WHERE cow_id=%s ORDER BY assessed_at DESC LIMIT 20",
        (cow_id,),
    )
    return [_safe(r) for r in rows]


@router.post("/bcs")
async def add_bcs(
    body: BCSEntry,
    current_user: dict = Depends(require_admin_or_vet()),
):
    if not (1.0 <= body.score <= 5.0):
        raise HTTPException(400, "BCS score must be between 1.0 and 5.0")
    await ensure_cow_access(current_user, body.cow_id)
    rid = await execute(
        """
        INSERT INTO BodyConditionScores (cow_id, score, notes, assessed_by)
        VALUES (%s,%s,%s,%s)
        """,
        (body.cow_id, body.score, body.notes, current_user["username"]),
    )
    return {"ok": True, "bcs_id": rid}
