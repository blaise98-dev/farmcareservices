"""
Base model for request bodies sent by the web forms.

A blank form field arrives as "" (an empty quantity, date or note). For an
optional field that means "not given", so it becomes the field's default
(usually None) before validation. Otherwise "" fails number validation (422)
or is rejected by MySQL as a date.
Required fields are left alone, so their own checks still apply, except that
a field named *_date must hold a real date (YYYY-MM-DD) rather than reaching
MySQL as "" or text.
"""
import types
import typing
from datetime import date

from pydantic import BaseModel, field_validator
from pydantic_core import PydanticUndefined


def _accepts_none(annotation) -> bool:
    if annotation is None or annotation is type(None):
        return True
    origin = typing.get_origin(annotation)
    if origin in (typing.Union, types.UnionType):
        return type(None) in typing.get_args(annotation)
    return False


class FormModel(BaseModel):
    @field_validator("*", mode="before")
    @classmethod
    def _blank_to_none(cls, value, info):
        field = cls.model_fields.get(info.field_name)
        if isinstance(value, str) and value.strip() == "":
            if field is not None and _accepts_none(field.annotation):
                default = field.get_default(call_default_factory=True)
                return None if default in (..., PydanticUndefined) else default   # "" means "use the default"
            if info.field_name.endswith("_date"):
                raise ValueError("is required")
        if isinstance(value, str) and info.field_name.endswith("_date"):
            try:
                date.fromisoformat(value.strip()[:10])
            except ValueError:
                raise ValueError("must be a date (YYYY-MM-DD)") from None
        return value
