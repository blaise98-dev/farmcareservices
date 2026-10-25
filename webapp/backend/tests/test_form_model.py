"""
Unit tests for blank form fields (form_model.FormModel).
Run: venv/bin/python -m pytest tests -q
"""
import os
import sys
from typing import Optional

import pytest
from pydantic import Field, ValidationError

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from form_model import FormModel  # noqa: E402


class Revenue(FormModel):
    revenue_date: str
    amount_rwf: float
    quantity: Optional[float] = Field(None, ge=0)
    unit: Optional[str] = None
    category: Optional[str] = "Milk Sale"
    next_due_date: Optional[str] = None


def test_blank_optional_fields_become_none_or_default():
    r = Revenue(revenue_date="2026-10-19", amount_rwf=20000, quantity="", unit="", category="", next_due_date="")
    assert (r.quantity, r.unit, r.category, r.next_due_date) == (None, None, "Milk Sale", None)


def test_blank_required_date_is_refused():
    with pytest.raises(ValidationError, match="is required"):
        Revenue(revenue_date="", amount_rwf=1)


def test_dates_must_be_real_dates():
    with pytest.raises(ValidationError, match="YYYY-MM-DD"):
        Revenue(revenue_date="19/10/2026", amount_rwf=1)
    assert Revenue(revenue_date="2026-10-19T08:00:00", amount_rwf=1).revenue_date.startswith("2026-10-19")


def test_blank_required_number_is_still_refused():
    with pytest.raises(ValidationError):
        Revenue(revenue_date="2026-10-19", amount_rwf="")
