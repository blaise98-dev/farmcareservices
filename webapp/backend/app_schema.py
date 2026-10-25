"""
Tables and columns the routers rely on, created when a server lacks them.

Older servers were set up by hand or by the earlier PHP API, so some tables
or newer columns may be missing there, and each missing one makes a page fail
("Failed" on save, "--" in its totals). On startup this creates missing tables
and adds missing columns. It never changes or drops an existing column.
farm_id columns are added afterwards by tenancy.ensure_farm_tenancy.
"""
import logging
import re

from database import execute, fetchall, fetchone

log = logging.getLogger(__name__)

# table -> (primary key definition, [(column, definition), ...])
TABLES = {
    "AnimalGroups": ("group_id INT AUTO_INCREMENT PRIMARY KEY", [
        ("group_name", "VARCHAR(100) NOT NULL"),
        ("group_type", "VARCHAR(50) DEFAULT 'Custom'"),
        ("description", "TEXT NULL"),
        ("created_by", "VARCHAR(100) NULL"),
        ("created_at", "DATETIME DEFAULT CURRENT_TIMESTAMP"),
    ]),
    "GroupMembers": ("group_id INT NOT NULL, cow_id INT NOT NULL, PRIMARY KEY (group_id, cow_id)", [
        ("added_at", "DATETIME DEFAULT CURRENT_TIMESTAMP"),
    ]),
    "Tanks": ("tank_id INT AUTO_INCREMENT PRIMARY KEY", [
        ("tank_name", "VARCHAR(100) NOT NULL"),
        ("tank_type", "VARCHAR(30) DEFAULT 'Water'"),
        ("capacity_liters", "FLOAT NOT NULL DEFAULT 0"),
        ("current_level_liters", "FLOAT DEFAULT 0"),
        ("min_level_liters", "FLOAT DEFAULT 0"),
        ("location", "VARCHAR(255) NULL"),
        ("is_active", "BOOLEAN DEFAULT TRUE"),
        ("last_refill_at", "DATETIME NULL"),
        ("created_at", "DATETIME DEFAULT CURRENT_TIMESTAMP"),
        ("updated_at", "DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"),
    ]),
    "TankReadings": ("reading_id INT AUTO_INCREMENT PRIMARY KEY", [
        ("tank_id", "INT NOT NULL"),
        ("level_liters", "FLOAT NOT NULL DEFAULT 0"),
        ("action", "VARCHAR(30) DEFAULT 'Reading'"),
        ("notes", "TEXT NULL"),
        ("recorded_by", "VARCHAR(100) NULL"),
        ("recorded_at", "DATETIME DEFAULT CURRENT_TIMESTAMP"),
    ]),
    "FeedInventory": ("inventory_id INT AUTO_INCREMENT PRIMARY KEY", [
        ("item_name", "VARCHAR(200) NOT NULL"),
        ("category", "VARCHAR(100) DEFAULT 'Hay'"),
        ("quantity_kg", "FLOAT NOT NULL DEFAULT 0"),
        ("dry_matter_pct", "FLOAT DEFAULT 85"),
        ("crude_protein_pct", "FLOAT DEFAULT 12"),
        ("unit_cost_rwf", "FLOAT DEFAULT 0"),
        ("reorder_level_kg", "FLOAT DEFAULT 0"),
        ("supplier", "VARCHAR(200) NULL"),
        ("purchase_date", "DATE NULL"),
        ("expiry_date", "DATE NULL"),
        ("notes", "TEXT NULL"),
        ("recorded_by", "VARCHAR(100) NULL"),
        ("created_at", "DATETIME DEFAULT CURRENT_TIMESTAMP"),
        ("updated_at", "DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"),
    ]),
    "WaterIntakeRecords": ("water_id INT AUTO_INCREMENT PRIMARY KEY", [
        ("cow_id", "INT NOT NULL"),
        ("water_intake_liters", "FLOAT NOT NULL DEFAULT 0"),
        ("recorded_by", "VARCHAR(100) NULL"),
        ("recorded_at", "DATETIME DEFAULT CURRENT_TIMESTAMP"),
    ]),
    "WeeklyPlan": ("task_id INT AUTO_INCREMENT PRIMARY KEY", [
        ("title", "VARCHAR(200) NOT NULL"),
        ("description", "TEXT NULL"),
        ("task_type", "VARCHAR(50) DEFAULT 'Other'"),
        ("assigned_to", "VARCHAR(100) NULL"),
        ("due_date", "DATE NOT NULL"),
        ("due_time", "TIME NULL"),
        ("cow_id", "INT NULL"),
        ("group_id", "INT NULL"),
        ("priority", "VARCHAR(20) DEFAULT 'Medium'"),
        ("status", "VARCHAR(30) DEFAULT 'Pending'"),
        ("created_by", "VARCHAR(100) NULL"),
        ("completed_at", "DATETIME NULL"),
        ("created_at", "DATETIME DEFAULT CURRENT_TIMESTAMP"),
    ]),
    "Components": ("component_id INT AUTO_INCREMENT PRIMARY KEY", [
        ("component_name", "VARCHAR(150) NOT NULL"),
        ("category", "VARCHAR(100) NULL"),
        ("quantity", "INT DEFAULT 1"),
        ("unit_cost_rwf", "FLOAT DEFAULT 0"),
        ("total_cost_rwf", "FLOAT DEFAULT 0"),
        ("status", "VARCHAR(30) DEFAULT 'Operational'"),
        ("supplier", "VARCHAR(200) NULL"),
        ("notes", "TEXT NULL"),
        ("created_at", "DATETIME DEFAULT CURRENT_TIMESTAMP"),
    ]),
    "PredictionsAnalytics": ("prediction_id INT AUTO_INCREMENT PRIMARY KEY", [
        ("cow_id", "INT NOT NULL"),
        ("prediction_type", "VARCHAR(50) NOT NULL"),
        ("predicted_value", "FLOAT NULL"),
        ("confidence_percent", "FLOAT NULL"),
        ("prediction_date", "DATE NULL"),
        ("notes", "TEXT NULL"),
        ("created_at", "DATETIME DEFAULT CURRENT_TIMESTAMP"),
    ]),
    "CowCosts": ("cost_id INT AUTO_INCREMENT PRIMARY KEY", [
        ("cow_id", "INT NOT NULL"),
        ("cost_date", "DATE NOT NULL"),
        ("cost_category", "VARCHAR(100) NOT NULL"),
        ("description", "VARCHAR(500) NULL"),
        ("amount_rwf", "DECIMAL(14,2) NOT NULL DEFAULT 0"),
        ("recorded_by", "VARCHAR(100) NULL"),
        ("role_type", "VARCHAR(30) NULL"),
        ("created_at", "DATETIME DEFAULT CURRENT_TIMESTAMP"),
    ]),
    "CowRevenues": ("revenue_id INT AUTO_INCREMENT PRIMARY KEY", [
        ("cow_id", "INT NOT NULL"),
        ("revenue_date", "DATE NOT NULL"),
        ("revenue_category", "VARCHAR(100) NOT NULL"),
        ("description", "VARCHAR(500) NULL"),
        ("amount_rwf", "DECIMAL(14,2) NOT NULL DEFAULT 0"),
        ("quantity", "FLOAT NULL"),
        ("unit", "VARCHAR(50) NULL"),
        ("recorded_by", "VARCHAR(100) NULL"),
        ("created_at", "DATETIME DEFAULT CURRENT_TIMESTAMP"),
    ]),
    "Feedback": ("feedback_id INT AUTO_INCREMENT PRIMARY KEY", [
        ("user_id", "INT NULL"),
        ("category", "VARCHAR(50) DEFAULT 'General'"),
        ("subject", "VARCHAR(200) NOT NULL"),
        ("message", "TEXT NOT NULL"),
        ("rating", "TINYINT NULL"),
        ("status", "VARCHAR(30) DEFAULT 'Pending'"),
        ("admin_reply", "TEXT NULL"),
        ("resolved_at", "DATETIME NULL"),
        ("created_at", "DATETIME DEFAULT CURRENT_TIMESTAMP"),
    ]),
    "ReproductionRecords": ("repro_id INT AUTO_INCREMENT PRIMARY KEY", [
        ("cow_id", "INT NOT NULL"),
        ("calving_date", "DATE NULL"),
        ("calf_sex", "VARCHAR(10) NULL"),
        ("calf_weight_kg", "FLOAT NULL"),
        ("insemination_date", "DATE NULL"),
        ("insemination_method", "VARCHAR(30) DEFAULT 'AI'"),
        ("expected_calving_date", "DATE NULL"),
        ("pregnancy_confirmed", "BOOLEAN DEFAULT FALSE"),
        ("notes", "TEXT NULL"),
        ("recorded_by", "VARCHAR(100) NULL"),
        ("recorded_at", "DATETIME DEFAULT CURRENT_TIMESTAMP"),
    ]),
    "TreatmentRecords": ("treatment_id INT AUTO_INCREMENT PRIMARY KEY", [
        ("cow_id", "INT NOT NULL"),
        ("treatment_date", "DATE NOT NULL"),
        ("diagnosis", "VARCHAR(255) NOT NULL"),
        ("drug_name", "VARCHAR(150) NOT NULL"),
        ("dose", "VARCHAR(100) NULL"),
        ("duration_days", "INT DEFAULT 1"),
        ("notes", "TEXT NULL"),
        ("follow_up_date", "DATE NULL"),
        ("administered_by", "VARCHAR(100) NULL"),
        ("is_completed", "BOOLEAN DEFAULT FALSE"),
        ("created_at", "DATETIME DEFAULT CURRENT_TIMESTAMP"),
    ]),
    "VaccinationRecords": ("vax_id INT AUTO_INCREMENT PRIMARY KEY", [
        ("cow_id", "INT NOT NULL"),
        ("vaccine_name", "VARCHAR(150) NOT NULL"),
        ("vaccination_date", "DATE NOT NULL"),
        ("next_due_date", "DATE NULL"),
        ("batch_number", "VARCHAR(100) NULL"),
        ("notes", "TEXT NULL"),
        ("administered_by", "VARCHAR(100) NULL"),
        ("created_at", "DATETIME DEFAULT CURRENT_TIMESTAMP"),
    ]),
    "BodyConditionScores": ("bcs_id INT AUTO_INCREMENT PRIMARY KEY", [
        ("cow_id", "INT NOT NULL"),
        ("score", "DECIMAL(3,1) NOT NULL DEFAULT 0"),
        ("notes", "TEXT NULL"),
        ("assessed_by", "VARCHAR(100) NULL"),
        ("assessed_at", "DATETIME DEFAULT CURRENT_TIMESTAMP"),
    ]),
}

# Newer columns on tables that every server has
EXTRA_COLUMNS = {
    "Alerts": [
        ("assigned_vet_id", "INT NULL"),
        ("created_by", "VARCHAR(100) NULL"),
    ],
    "FeedingRecords": [
        ("group_id", "INT NULL"),
        ("feed_amount_kg", "FLOAT NOT NULL DEFAULT 0"),
        ("feed_type", "VARCHAR(100) DEFAULT 'Mixed Feed'"),
        ("methane_impact", "VARCHAR(20) DEFAULT 'Neutral'"),
        ("dispensed_by_system", "BOOLEAN DEFAULT FALSE"),
        ("prescription_notes", "TEXT NULL"),
        ("entry_date", "DATE NULL"),
    ],
}


def _addable(definition: str) -> str:
    """A required column without a default is added as nullable, so existing rows never block it."""
    if "NOT NULL" in definition and "DEFAULT" not in definition:
        return re.sub(r"\bNOT NULL\b", "NULL", definition)
    return definition


async def _columns(table: str) -> set:
    rows = await fetchall(
        "SELECT column_name AS c FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = %s",
        (table,),
    )
    return {r["c"] for r in rows}


async def _add_missing(table: str, columns: list) -> None:
    have = await _columns(table)
    for name, definition in columns:
        if name in have:
            continue
        try:
            await execute(f"ALTER TABLE {table} ADD COLUMN {name} {_addable(definition)}")
            log.info("app_schema: added %s.%s", table, name)
        except Exception:  # noqa: BLE001 - one column must not stop the rest
            log.exception("app_schema: could not add %s.%s", table, name)


async def ensure_app_schema() -> None:
    for table, (key, columns) in TABLES.items():
        try:
            exists = await fetchone(
                "SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = %s",
                (table,),
            )
            if not exists["n"]:
                body = ",\n    ".join([key] + [f"{n} {d}" for n, d in columns])
                await execute(f"CREATE TABLE {table} (\n    {body}\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4")
                log.info("app_schema: created %s", table)
            else:
                await _add_missing(table, columns)
        except Exception:  # noqa: BLE001
            log.exception("app_schema: could not check %s", table)
    for table, columns in EXTRA_COLUMNS.items():
        try:
            await _add_missing(table, columns)
        except Exception:  # noqa: BLE001
            log.exception("app_schema: could not check %s", table)
