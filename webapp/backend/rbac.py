"""
Role-Based Access Control helpers for MooMe.

Permission Matrix
─────────────────────────────────────────────────────────────────────────────
                        Admin   Farmer  Veterinarian  Technician
─────────────────────────────────────────────────────────────────────────────
Dashboard (read)          ✓       ✓         ✓             ✓
Herd list / cow detail    ✓       ✓         ✓             ✓
Update cow weight         ✓       ✓         ✓             ✗
Update cow health status  ✓       ✗         ✓             ✗
Deactivate / retire cow   ✓       ✗         ✗             ✗
Milk — read               ✓       ✓         ✓             ✓
Milk — log record         ✓       ✓         ✗             ✗
Feed — read               ✓       ✓         ✓             ✓
Feed — log record         ✓       ✓         ✗             ✗
Environment — read        ✓       ✓         ✓             ✓
Environment — add reading ✓       ✗         ✗             ✓
Alerts — read             ✓       ✓         ✓             ✓
Alerts — resolve          ✓       ✓         ✓             ✓
Alerts — create           ✓       ✓         ✓             ✓
Alerts — create Health    ✓       ✗         ✓             ✗
Economics — read          ✓       ✓         ✗             ✓
Economics — edit          ✓       ✗         ✗             ✗
Predictions — read        ✓       ✗         ✓             ✗
Predictions — read health ✓       ✗         ✓             ✗
User management           ✓       ✗         ✗             ✗
Settings                  ✓       ✓         ✓             ✓
─────────────────────────────────────────────────────────────────────────────
"""

from fastapi import Depends, HTTPException, status
from routers.auth import get_current_user

# ── Role constants ─────────────────────────────────────────────
ADMIN        = "Admin"
FARMER       = "Farmer"
VETERINARIAN = "Veterinarian"
TECHNICIAN   = "Technician"

ALL_ROLES = {ADMIN, FARMER, VETERINARIAN, TECHNICIAN}


def _require(allowed: set):
    """Return a FastAPI dependency that checks the current user's role."""
    async def _dep(current_user: dict = Depends(get_current_user)) -> dict:
        if current_user["role"] not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required roles: {', '.join(sorted(allowed))}",
            )
        return current_user
    return _dep


# ── Pre-built dependency factories ────────────────────────────
def require_any():
    """All authenticated users."""
    return _require(ALL_ROLES)


def require_admin():
    return _require({ADMIN})


def require_admin_or_vet():
    return _require({ADMIN, VETERINARIAN})


def require_admin_or_farmer():
    return _require({ADMIN, FARMER})


def require_admin_or_technician():
    return _require({ADMIN, TECHNICIAN})


def require_not_technician():
    """Anyone except Technician."""
    return _require({ADMIN, FARMER, VETERINARIAN})


def require_vet_or_admin():
    """Admin and Veterinarian — health diagnostics, health alerts."""
    return _require({ADMIN, VETERINARIAN})


def require_can_update_health():
    """Only Admin and Veterinarian can change a cow's health status."""
    return _require({ADMIN, VETERINARIAN})


def require_can_log_milk():
    """Admin and Farmer log milk records."""
    return _require({ADMIN, FARMER})


def require_can_log_feed():
    """Admin, Farmer, and Veterinarian log feed records (vet prescribes nutrition)."""
    return _require({ADMIN, FARMER, VETERINARIAN})


def require_can_add_env():
    """Admin and Technician add environmental readings (sensor calibration)."""
    return _require({ADMIN, TECHNICIAN})


def require_can_retire_cow():
    """Only Admin can deactivate / retire a cow."""
    return _require({ADMIN})


def require_can_view_economics():
    """Admin, Farmer, and Technician view economics."""
    return _require({ADMIN, FARMER, TECHNICIAN})


def require_can_view_predictions():
    """Admin and Veterinarian view predictions (Farmer and Technician excluded)."""
    return _require({ADMIN, VETERINARIAN})


def require_can_view_health_risks():
    """Admin and Veterinarian view detailed health-risk predictions."""
    return _require({ADMIN, VETERINARIAN})


def require_farmer_only():
    """Only Farmers can register cows and manage their herd write operations."""
    return _require({FARMER})


def require_vet_only():
    """Only Veterinarians can perform health write operations."""
    return _require({VETERINARIAN})
