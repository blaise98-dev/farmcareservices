"""
Authentication router — login, token refresh, current user.
Uses bcrypt passwords + JWT bearer tokens.
"""
import hashlib
import secrets
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, status, BackgroundTasks
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel

from config import settings
from database import fetchone, execute, fetchall
from email_service import send_password_reset_email

router = APIRouter(prefix="/api/auth", tags=["auth"])

# ── Crypto ────────────────────────────────────────────────────
pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 12   # 12 hours


# ── Schemas ───────────────────────────────────────────────────
class Token(BaseModel):
    access_token: str
    token_type: str
    user: dict


class ForgotPasswordRequest(BaseModel):
    identifier: str   # email or username


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


FORGOT_PASSWORD_MSG = (
    "If an account with that email exists, a password reset link has been sent."
)


# ── Helpers ───────────────────────────────────────────────────
def create_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode["exp"] = expire
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=ALGORITHM)


def _safe_user(row: dict) -> dict:
    """Return user dict without password_hash; convert datetime fields."""
    out = {}
    for k, v in row.items():
        if k == "password_hash":
            continue
        if hasattr(v, "isoformat"):
            out[k] = v.isoformat()
        else:
            out[k] = v
    return out


def _hash_reset_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


async def _find_user_by_identifier(identifier: str) -> Optional[dict]:
    identifier = identifier.strip()
    if "@" in identifier:
        return await fetchone(
            "SELECT * FROM Users WHERE email=%s AND is_active=TRUE",
            (identifier,),
        )
    return await fetchone(
        "SELECT * FROM Users WHERE username=%s AND is_active=TRUE",
        (identifier,),
    )


async def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    creds_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise creds_exc
    except JWTError:
        raise creds_exc

    user = await fetchone(
        "SELECT * FROM Users WHERE username=%s AND is_active=TRUE",
        (username,),
    )
    if not user:
        raise creds_exc
    return user


# ── Routes ────────────────────────────────────────────────────
@router.post("/login", response_model=Token)
async def login(form: OAuth2PasswordRequestForm = Depends()):
    user = await fetchone(
        "SELECT * FROM Users WHERE username=%s AND is_active=TRUE",
        (form.username,),
    )
    if not user:
        raise HTTPException(status_code=400, detail="Incorrect username or password")

    ph = user["password_hash"]
    try:
        valid = pwd_ctx.verify(form.password, ph)
    except Exception:
        valid = False

    if not valid:
        raise HTTPException(status_code=400, detail="Incorrect username or password")

    await execute(
        "UPDATE Users SET last_login=NOW() WHERE user_id=%s",
        (user["user_id"],),
    )

    token = create_token({"sub": user["username"], "role": user["role"]})
    return {"access_token": token, "token_type": "bearer", "user": _safe_user(user)}


@router.get("/me")
async def me(current_user: dict = Depends(get_current_user)):
    return _safe_user(current_user)


@router.post("/change-password")
async def change_password(
    body: dict,
    current_user: dict = Depends(get_current_user),
):
    new_pw = body.get("new_password", "")
    if len(new_pw) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")
    hashed = pwd_ctx.hash(new_pw)
    await execute(
        "UPDATE Users SET password_hash=%s WHERE user_id=%s",
        (hashed, current_user["user_id"]),
    )
    return {"ok": True, "message": "Password updated successfully"}


@router.post("/forgot-password")
async def forgot_password(
    body: ForgotPasswordRequest,
    background_tasks: BackgroundTasks,
):
    """Request a password reset link by email or username."""
    identifier = body.identifier.strip()
    if not identifier:
        raise HTTPException(400, "Email or username is required")

    user = await _find_user_by_identifier(identifier)
    if user and user.get("email"):
        await execute(
            "UPDATE PasswordResetTokens SET used_at=NOW() "
            "WHERE user_id=%s AND used_at IS NULL",
            (user["user_id"],),
        )

        raw_token = secrets.token_urlsafe(32)
        expires_at = datetime.utcnow() + timedelta(
            minutes=settings.RESET_TOKEN_EXPIRE_MINUTES
        )
        await execute(
            """
            INSERT INTO PasswordResetTokens (user_id, token_hash, expires_at)
            VALUES (%s, %s, %s)
            """,
            (user["user_id"], _hash_reset_token(raw_token), expires_at),
        )

        reset_url = (
            f"{settings.FRONTEND_URL.rstrip('/')}/reset-password?token={raw_token}"
        )
        name = user.get("full_name") or user["username"]
        background_tasks.add_task(
            send_password_reset_email, user["email"], name, reset_url
        )

    return {"ok": True, "message": FORGOT_PASSWORD_MSG}


@router.get("/reset-password/validate")
async def validate_reset_token(token: str):
    """Check whether a reset token is still valid."""
    if not token:
        return {"valid": False}
    row = await fetchone(
        """
        SELECT token_id FROM PasswordResetTokens
        WHERE token_hash=%s AND used_at IS NULL AND expires_at > NOW()
        """,
        (_hash_reset_token(token),),
    )
    return {"valid": bool(row)}


@router.post("/reset-password")
async def reset_password(body: ResetPasswordRequest):
    """Set a new password using a valid reset token."""
    new_pw = body.new_password
    if len(new_pw) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")

    row = await fetchone(
        """
        SELECT prt.token_id, prt.user_id
        FROM PasswordResetTokens prt
        JOIN Users u ON u.user_id = prt.user_id
        WHERE prt.token_hash=%s
          AND prt.used_at IS NULL
          AND prt.expires_at > NOW()
          AND u.is_active = TRUE
        """,
        (_hash_reset_token(body.token),),
    )
    if not row:
        raise HTTPException(400, "Invalid or expired reset link. Please request a new one.")

    hashed = pwd_ctx.hash(new_pw)
    await execute(
        "UPDATE Users SET password_hash=%s WHERE user_id=%s",
        (hashed, row["user_id"]),
    )
    await execute(
        "UPDATE PasswordResetTokens SET used_at=NOW() WHERE token_id=%s",
        (row["token_id"],),
    )
    await execute(
        "UPDATE PasswordResetTokens SET used_at=NOW() "
        "WHERE user_id=%s AND used_at IS NULL",
        (row["user_id"],),
    )
    return {"ok": True, "message": "Password reset successfully. You can now sign in."}


@router.get("/vets")
async def list_vets(current_user: dict = Depends(get_current_user)):
    """Any authenticated user can get the list of active veterinarians (for notify-vet dropdown)."""
    rows = await fetchall(
        "SELECT user_id, username, full_name, phone_number FROM Users WHERE role='Veterinarian' AND is_active=TRUE ORDER BY full_name"
    )
    return [_safe_user(r) for r in rows]


@router.get("/users")
async def list_users(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "Admin":
        raise HTTPException(403, "Admin only")
    rows = await fetchall(
        "SELECT user_id, username, full_name, email, phone_number, role, farm_id, is_active, last_login FROM Users"
    )
    return [_safe_user(r) for r in rows]


# ── User management (Admin only) ──────────────────────────────

VALID_ROLES = {"Admin", "Farmer", "Veterinarian", "Technician"}


class UserCreate(BaseModel):
    username: str
    password: str
    full_name: str
    email: Optional[str] = None
    phone_number: Optional[str] = None
    role: str                     # Admin, Farmer, Veterinarian, Technician
    farm_id: Optional[int] = 1
    province: Optional[str] = None
    district: Optional[str] = None
    sector:   Optional[str] = None
    cell:     Optional[str] = None
    village:  Optional[str] = None


class UserUpdate(BaseModel):
    role: Optional[str] = None
    is_active: Optional[bool] = None
    full_name: Optional[str] = None
    email: Optional[str] = None
    phone_number: Optional[str] = None


@router.post("/users/create")
async def create_user(
    body: UserCreate,
    current_user: dict = Depends(get_current_user),
):
    """Admin only — create a new platform user."""
    if current_user["role"] != "Admin":
        raise HTTPException(403, "Admin only")
    if body.role not in VALID_ROLES:
        raise HTTPException(400, f"Invalid role. Must be one of: {', '.join(sorted(VALID_ROLES))}")

    # Check duplicate username
    existing = await fetchone("SELECT user_id FROM Users WHERE username=%s", (body.username,))
    if existing:
        raise HTTPException(409, f"Username '{body.username}' is already taken")

    hashed = pwd_ctx.hash(body.password)
    uid = await execute(
        """
        INSERT INTO Users (username, password_hash, full_name, email, phone_number,
                           role, farm_id, is_active,
                           province, district, sector, cell_name, village)
        VALUES (%s, %s, %s, %s, %s, %s, %s, TRUE, %s, %s, %s, %s, %s)
        """,
        (body.username, hashed, body.full_name, body.email,
         body.phone_number, body.role, body.farm_id,
         body.province, body.district, body.sector, body.cell, body.village),
    )
    return {"ok": True, "user_id": uid, "username": body.username, "role": body.role}


@router.patch("/users/{user_id}")
async def update_user(
    user_id: int,
    body: UserUpdate,
    current_user: dict = Depends(get_current_user),
):
    """Admin only — update role, active status, or profile fields."""
    if current_user["role"] != "Admin":
        raise HTTPException(403, "Admin only")

    target = await fetchone("SELECT user_id FROM Users WHERE user_id=%s", (user_id,))
    if not target:
        raise HTTPException(404, "User not found")

    if body.role is not None and body.role not in VALID_ROLES:
        raise HTTPException(400, f"Invalid role. Must be one of: {', '.join(sorted(VALID_ROLES))}")

    fields = {k: v for k, v in body.model_dump().items() if v is not None}
    if not fields:
        raise HTTPException(400, "No fields to update")

    set_clause = ", ".join(f"{k}=%s" for k in fields)
    vals = list(fields.values()) + [user_id]
    await execute(f"UPDATE Users SET {set_clause} WHERE user_id=%s", vals)
    return {"ok": True}


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: int,
    current_user: dict = Depends(get_current_user),
):
    """Admin only — permanently delete a user (cannot delete own account)."""
    if current_user["role"] != "Admin":
        raise HTTPException(403, "Admin only")
    if current_user["user_id"] == user_id:
        raise HTTPException(400, "Cannot delete your own account")
    target = await fetchone("SELECT user_id FROM Users WHERE user_id=%s", (user_id,))
    if not target:
        raise HTTPException(404, "User not found")
    await execute("DELETE FROM Users WHERE user_id=%s", (user_id,))
    return {"ok": True}


@router.patch("/avatar")
async def update_avatar(
    body: dict,
    current_user: dict = Depends(get_current_user),
):
    """Any authenticated user can update their own avatar (base64 data URL)."""
    avatar_url = body.get("avatar_url", "")
    await execute(
        "UPDATE Users SET avatar_url=%s WHERE user_id=%s",
        (avatar_url, current_user["user_id"]),
    )
    return {"ok": True}


@router.post("/users/{user_id}/reset-password")
async def admin_reset_password(
    user_id: int,
    body: dict,
    current_user: dict = Depends(get_current_user),
):
    """Admin only — reset another user's password."""
    if current_user["role"] != "Admin":
        raise HTTPException(403, "Admin only")
    new_pw = body.get("new_password", "")
    if len(new_pw) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")
    target = await fetchone("SELECT user_id FROM Users WHERE user_id=%s", (user_id,))
    if not target:
        raise HTTPException(404, "User not found")
    hashed = pwd_ctx.hash(new_pw)
    await execute(
        "UPDATE Users SET password_hash=%s WHERE user_id=%s",
        (hashed, user_id),
    )
    return {"ok": True}
