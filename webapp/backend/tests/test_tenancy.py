"""
Unit tests for farm tenancy: who sees which farm's rows.
Run: venv/bin/python -m pytest tests -q
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from tenancy import _admin_farm, cow_clause, device_clause, farm_clause  # noqa: E402

ADMIN = {"role": "Admin", "farm_id": 1}
FARMER = {"role": "Farmer", "farm_id": 2}
NEW_VET = {"role": "Veterinarian", "farm_id": None}


def test_admin_sees_every_farm():
    assert farm_clause(ADMIN) == ("1=1", ())
    assert cow_clause(ADMIN) == ("1=1", ())


def test_admin_farm_picker_limits_to_one_farm():
    token = _admin_farm.set(3)
    try:
        assert farm_clause(ADMIN, "c.farm_id") == ("c.farm_id = %s", (3,))
        assert device_clause(ADMIN)[1] == (3,)
    finally:
        _admin_farm.reset(token)


def test_farm_picker_is_ignored_for_non_admins():
    token = _admin_farm.set(3)
    try:
        assert farm_clause(FARMER) == ("farm_id = %s", (2,))
    finally:
        _admin_farm.reset(token)


def test_farmer_sees_own_farm_through_cows_and_devices():
    assert farm_clause(FARMER, "a.farm_id") == ("a.farm_id = %s", (2,))
    sql, args = cow_clause(FARMER, "m.cow_id")
    assert sql.startswith("m.cow_id IN (SELECT cow_id FROM Cows WHERE farm_id") and args == (2,)
    sql, args = device_clause(FARMER)
    assert "IoTDevices" in sql and args == (2,)


def test_user_without_farm_sees_nothing():
    for clause in (farm_clause, cow_clause, device_clause):
        assert clause(NEW_VET) == ("1=0", ())
