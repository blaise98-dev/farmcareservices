from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from database import fetchall, fetchone, execute
from rbac import (
    require_any, require_can_update_health,
    require_can_retire_cow, require_admin_or_vet,
    require_admin_or_farmer, require_farmer_only,
)

router = APIRouter(prefix="/api/herd", tags=["herd"])


class CowUpdate(BaseModel):
    # Identity / profile — editable by Farmer
    cow_name:           Optional[str]   = None
    sex:                Optional[str]   = None
    breed:              Optional[str]   = None
    breed_type:         Optional[str]   = None
    breed_concentration:Optional[str]   = None
    birth_date:         Optional[str]   = None
    weight_kg:          Optional[float] = None
    lactating:          Optional[bool]  = None
    cow_category:       Optional[str]   = None
    cow_stage:          Optional[str]   = None
    mother_id:          Optional[int]   = None
    # Location
    province:           Optional[str]   = None
    district:           Optional[str]   = None
    sector:             Optional[str]   = None
    cell_name:          Optional[str]   = None
    village:            Optional[str]   = None
    # Health — Vet/Admin only
    health_status:      Optional[str]   = None
    # Admin only
    is_active:          Optional[bool]  = None
    sale_price_rwf:     Optional[float] = None
    sold_date:          Optional[str]   = None
    death_date:         Optional[str]   = None
    death_cause:        Optional[str]   = None


class CowCreate(BaseModel):
    rfid_tag: str
    cow_name: str
    sex: Optional[str] = "Female"               # Female | Male
    breed: str
    breed_type: Optional[str] = "Pure"
    breed_concentration: Optional[str] = "100%"
    cow_stage: Optional[str] = "Cow"            # full 12-category list
    birth_date: str
    weight_kg: float
    health_status: Optional[str] = "Healthy"
    lactating: Optional[bool] = True
    cow_category: Optional[str] = "Production"
    mother_id: Optional[int] = None
    province: Optional[str] = None
    district: Optional[str] = None
    sector:   Optional[str] = None
    cell:     Optional[str] = None
    village:  Optional[str] = None


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


@router.get("/")
async def list_cows(_=Depends(require_any())):
    rows = await fetchall(
        """
        SELECT c.*,
               TIMESTAMPDIFF(MONTH, c.birth_date, CURDATE()) AS age_months,
               t.body_temp_celsius AS latest_temp,
               t.status AS temp_status,
               (SELECT SUM(milk_amount_liters)
                FROM MilkProductionRecords
                WHERE cow_id = c.cow_id AND DATE(recorded_at) = CURDATE()) AS today_milk,
               (SELECT water_intake_liters
                FROM WaterIntakeRecords
                WHERE cow_id = c.cow_id
                ORDER BY recorded_at DESC LIMIT 1) AS latest_water,
               m.cow_name AS mother_name
        FROM Cows c
        LEFT JOIN TemperatureReadings t ON c.cow_id = t.cow_id
            AND t.recorded_at = (
                SELECT MAX(recorded_at) FROM TemperatureReadings WHERE cow_id = c.cow_id
            )
        LEFT JOIN Cows m ON c.mother_id = m.cow_id
        WHERE c.is_active = TRUE
        ORDER BY c.cow_id
        """
    )
    return [_safe(r) for r in rows]


@router.get("/summary/counts")
async def herd_counts(_=Depends(require_any())):
    by_health = await fetchall(
        "SELECT health_status, COUNT(*) AS cnt FROM Cows WHERE is_active=1 GROUP BY health_status"
    )
    by_category = await fetchall(
        "SELECT COALESCE(cow_stage,'Unknown') AS cow_stage, COALESCE(sex,'Female') AS sex, COUNT(*) AS cnt FROM Cows WHERE is_active=1 GROUP BY cow_stage, sex"
    )
    by_breed = await fetchall(
        "SELECT breed, COUNT(*) AS cnt FROM Cows WHERE is_active=1 GROUP BY breed"
    )
    by_sex = await fetchall(
        "SELECT COALESCE(sex,'Female') AS sex, COUNT(*) AS cnt FROM Cows WHERE is_active=1 GROUP BY sex"
    )
    lactating = await fetchone(
        "SELECT COUNT(*) AS cnt FROM Cows WHERE lactating=1 AND is_active=1"
    )
    return {
        "by_health":    by_health,
        "by_category":  by_category,
        "by_breed":     by_breed,
        "by_sex":       by_sex,
        "lactating":    lactating["cnt"] if lactating else 0,
    }


@router.get("/analytics")
async def herd_analytics(_=Depends(require_any())):
    """Full analytics dataset for the Herd Analytics dashboard."""
    cows = await fetchall(
        """
        SELECT c.cow_id, c.cow_name, c.rfid_tag, c.sex, c.breed, c.breed_type,
               c.breed_concentration, c.cow_stage, c.cow_category, c.health_status,
               c.lactating, c.weight_kg, c.birth_date, c.province, c.district,
               TIMESTAMPDIFF(MONTH, c.birth_date, CURDATE()) AS age_months,
               (SELECT SUM(milk_amount_liters) FROM MilkProductionRecords
                WHERE cow_id = c.cow_id AND recorded_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
               ) AS milk_30d,
               (SELECT SUM(feed_amount_kg) FROM FeedingRecords
                WHERE cow_id = c.cow_id AND recorded_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
               ) AS feed_30d
        FROM Cows c WHERE c.is_active = TRUE ORDER BY c.cow_id
        """
    )
    return [_safe(r) for r in cows]


@router.get("/next-rfid")
async def next_rfid(_=Depends(require_farmer_only())):
    """Return the next auto-generated RFID tag (Farmer only)."""
    row = await fetchone(
        """
        SELECT rfid_tag FROM Cows
        WHERE rfid_tag REGEXP '^RFID-[0-9]+$'
        ORDER BY CAST(SUBSTRING(rfid_tag, 6) AS UNSIGNED) DESC
        LIMIT 1
        """
    )
    if row:
        last_num = int(row["rfid_tag"].split("-")[1])
        next_num = last_num + 1
    else:
        next_num = 1
    return {"rfid_tag": f"RFID-{next_num:03d}"}


@router.get("/offspring/{cow_id}")
async def get_offspring(cow_id: int, _=Depends(require_any())):
    """Return all direct offspring of a cow."""
    rows = await fetchall(
        """
        SELECT c.cow_id, c.rfid_tag, c.cow_name, c.breed, c.cow_stage,
               c.birth_date, c.weight_kg, c.health_status, c.is_active,
               TIMESTAMPDIFF(MONTH, c.birth_date, CURDATE()) AS age_months
        FROM Cows c
        WHERE c.mother_id = %s
        ORDER BY c.birth_date DESC
        """,
        (cow_id,),
    )
    return [_safe(r) for r in rows]


@router.get("/{cow_id}")
async def get_cow(cow_id: int, _=Depends(require_any())):
    cow = await fetchone(
        """
        SELECT c.*, TIMESTAMPDIFF(MONTH, c.birth_date, CURDATE()) AS age_months,
               m.cow_name AS mother_name
        FROM Cows c
        LEFT JOIN Cows m ON c.mother_id = m.cow_id
        WHERE c.cow_id = %s
        """,
        (cow_id,),
    )
    if not cow:
        raise HTTPException(404, "Cow not found")

    temps = await fetchall(
        "SELECT * FROM TemperatureReadings WHERE cow_id=%s ORDER BY recorded_at DESC LIMIT 20",
        (cow_id,),
    )
    feeds = await fetchall(
        "SELECT * FROM FeedingRecords WHERE cow_id=%s ORDER BY recorded_at DESC LIMIT 10",
        (cow_id,),
    )
    water = await fetchall(
        "SELECT * FROM WaterIntakeRecords WHERE cow_id=%s ORDER BY recorded_at DESC LIMIT 10",
        (cow_id,),
    )
    milk = await fetchall(
        "SELECT * FROM MilkProductionRecords WHERE cow_id=%s ORDER BY recorded_at DESC LIMIT 14",
        (cow_id,),
    )
    alerts = await fetchall(
        "SELECT * FROM Alerts WHERE cow_id=%s ORDER BY created_at DESC LIMIT 10",
        (cow_id,),
    )
    predictions = await fetchall(
        "SELECT * FROM PredictionsAnalytics WHERE cow_id=%s ORDER BY prediction_date ASC",
        (cow_id,),
    )
    offspring = await fetchall(
        """
        SELECT cow_id, rfid_tag, cow_name, breed, cow_stage, birth_date, weight_kg,
               health_status, TIMESTAMPDIFF(MONTH, birth_date, CURDATE()) AS age_months
        FROM Cows WHERE mother_id=%s AND is_active=TRUE ORDER BY birth_date DESC
        """,
        (cow_id,),
    )
    water_quality = await fetchall(
        "SELECT * FROM WaterQualityReadings WHERE cow_id=%s ORDER BY recorded_at DESC LIMIT 20",
        (cow_id,),
    )
    location = await fetchall(
        "SELECT * FROM LocationReadings WHERE cow_id=%s ORDER BY recorded_at DESC LIMIT 50",
        (cow_id,),
    )
    vitals = await fetchall(
        "SELECT * FROM VitalsReadings WHERE cow_id=%s ORDER BY recorded_at DESC LIMIT 20",
        (cow_id,),
    )
    motion = await fetchall(
        "SELECT * FROM MotionReadings WHERE cow_id=%s ORDER BY recorded_at DESC LIMIT 20",
        (cow_id,),
    )
    return {
        "cow":            _safe(cow),
        "temperatures":   [_safe(r) for r in temps],
        "feedings":       [_safe(r) for r in feeds],
        "water_intake":   [_safe(r) for r in water],
        "milk_production":[_safe(r) for r in milk],
        "alerts":         [_safe(r) for r in alerts],
        "predictions":    [_safe(r) for r in predictions],
        "offspring":      [_safe(r) for r in offspring],
        "water_quality":  [_safe(r) for r in water_quality],
        "location":       [_safe(r) for r in location],
        "vitals":         [_safe(r) for r in vitals],
        "motion":         [_safe(r) for r in motion],
    }


@router.patch("/{cow_id}")
async def update_cow(
    cow_id: int,
    body: CowUpdate,
    current_user: dict = Depends(require_any()),
):
    role = current_user["role"]

    # Health status: Vet or Admin only
    if body.health_status is not None and role not in ("Admin", "Veterinarian"):
        raise HTTPException(403, "Only Veterinarian or Admin can update health status")

    # Retire/reactivate: Admin only
    if body.is_active is not None and role != "Admin":
        raise HTTPException(403, "Only Admin can retire or reactivate a cow")

    # Technicians are read-only for cow data
    if role == "Technician":
        raise HTTPException(403, "Technicians have read-only access to cow records")

    fields = {k: v for k, v in body.model_dump().items() if v is not None}
    if not fields:
        raise HTTPException(400, "No fields to update")

    set_clause = ", ".join(f"{k}=%s" for k in fields)
    vals = list(fields.values()) + [cow_id]
    await execute(f"UPDATE Cows SET {set_clause} WHERE cow_id=%s", vals)
    return {"ok": True}


@router.get("/activity")
async def cow_activity(_=Depends(require_any())):
    rows = await fetchall(
        """
        SELECT c.cow_id, c.cow_name, c.health_status, c.lactating,
               c.weight_kg, c.cow_stage, c.breed_concentration,
               TIMESTAMPDIFF(MONTH, c.birth_date, CURDATE()) AS age_months,
               ROUND((RAND() * 60 + 20), 0) AS activity_steps,
               CASE WHEN RAND() < 0.15 THEN 'Low'
                    WHEN RAND() < 0.7  THEN 'Normal'
                    ELSE 'High' END AS activity_level
        FROM Cows c
        WHERE c.is_active = TRUE
        ORDER BY c.cow_id
        """
    )
    return [_safe(r) for r in rows]


@router.post("/register")
async def register_cow(
    body: CowCreate,
    current_user: dict = Depends(require_farmer_only()),
):
    """Only Farmers can register cows."""
    existing = await fetchone("SELECT cow_id FROM Cows WHERE rfid_tag=%s", (body.rfid_tag,))
    if existing:
        raise HTTPException(409, f"RFID tag '{body.rfid_tag}' is already registered")

    if body.mother_id:
        mother = await fetchone("SELECT cow_id FROM Cows WHERE cow_id=%s", (body.mother_id,))
        if not mother:
            raise HTTPException(404, f"Mother cow with id {body.mother_id} not found")

    cow_id = await execute(
        """
        INSERT INTO Cows (rfid_tag, cow_name, sex, breed, breed_type, breed_concentration,
                          cow_stage, birth_date, weight_kg, health_status, lactating,
                          cow_category, mother_id,
                          province, district, sector, cell_name, village)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        """,
        (body.rfid_tag, body.cow_name, body.sex or "Female",
         body.breed, body.breed_type, body.breed_concentration,
         body.cow_stage, body.birth_date, body.weight_kg, body.health_status, body.lactating,
         body.cow_category or "Production", body.mother_id,
         body.province, body.district, body.sector, body.cell, body.village),
    )
    return {"ok": True, "cow_id": cow_id, "cow_name": body.cow_name}
