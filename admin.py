"""
AdminDash: admin-only user management endpoints.
"""
import datetime
import uuid
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

import models
from database import get_db
from auth import get_current_user, get_password_hash

router = APIRouter(prefix="/api/admin", tags=["admin"])


def require_admin(current_user: models.User = Depends(get_current_user)) -> models.User:
    if current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return current_user


class AdminUserCreate(BaseModel):
    username: str
    password: str
    email: str | None = None
    role: str = "user"
    airport_iata: str | None = None
    airport_icao: str | None = None
    airport_name: str | None = None
    airport_city: str | None = None
    airport_country: str | None = None


class AdminUserUpdate(BaseModel):
    # AdminEditUser: username is admin-editable (self-service profile page is not).
    username: str | None = None
    email: str | None = None
    role: str | None = None
    password: str | None = None
    airport_iata: str | None = None
    airport_icao: str | None = None
    airport_name: str | None = None
    airport_city: str | None = None
    airport_country: str | None = None


def _serialize(u: models.User) -> dict:
    return {
        "id": u.id,
        "username": u.username,
        "email": u.email,
        "role": u.role,
        "auth_provider": u.auth_provider,
        "airport_iata": u.airport_iata,
        "airport_icao": u.airport_icao,
        "airport_name": u.airport_name,
        "airport_city": u.airport_city,
        "airport_country": u.airport_country,
        "created_at": u.created_at.isoformat() if u.created_at else None,
    }


@router.get("/users")
def list_users(db: Session = Depends(get_db), _: models.User = Depends(require_admin)):
    users = db.query(models.User).order_by(models.User.created_at.desc()).all()
    return [_serialize(u) for u in users]


@router.post("/users", status_code=201)
def create_user(body: AdminUserCreate, db: Session = Depends(get_db), _: models.User = Depends(require_admin)):
    if not body.username or not body.password:
        raise HTTPException(status_code=400, detail="Username and password required")
    if len(body.password) < 4:
        raise HTTPException(status_code=400, detail="Password must be at least 4 characters")
    if db.query(models.User).filter(models.User.username == body.username).first():
        raise HTTPException(status_code=409, detail="Username already exists")
    if body.email and db.query(models.User).filter(models.User.email == body.email).first():
        raise HTTPException(status_code=409, detail="Email already in use")
    if body.role not in ("user", "admin"):
        raise HTTPException(status_code=400, detail="Invalid role")

    user = models.User(
        id=str(uuid.uuid4()),
        username=body.username,
        email=body.email,
        password_hash=get_password_hash(body.password),
        role=body.role,
        auth_provider="local",
        airport_iata=body.airport_iata,
        airport_icao=body.airport_icao,
        airport_name=body.airport_name,
        airport_city=body.airport_city,
        airport_country=body.airport_country,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return _serialize(user)


@router.patch("/users/{user_id}")
def update_user(
    user_id: str,
    body: AdminUserUpdate,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    data = body.model_dump(exclude_unset=True)
    if "username" in data:
        new_username = (data.pop("username") or "").strip()
        if not new_username:
            raise HTTPException(status_code=400, detail="Username cannot be empty")
        if new_username != user.username:
            clash = db.query(models.User).filter(
                models.User.username == new_username,
                models.User.id != user.id,
            ).first()
            if clash:
                raise HTTPException(status_code=409, detail="Username already exists")
            user.username = new_username
    if "role" in data and data["role"] not in ("user", "admin"):
        raise HTTPException(status_code=400, detail="Invalid role")
    if "password" in data:
        pw = data.pop("password")
        if pw:
            if len(pw) < 4:
                raise HTTPException(status_code=400, detail="Password must be at least 4 characters")
            user.password_hash = get_password_hash(pw)
    for k, v in data.items():
        setattr(user, k, v)
    db.commit()
    db.refresh(user)
    return _serialize(user)


# UsernameRequest: admin review payload — optional note shown back to the user.
class UsernameRequestReview(BaseModel):
    admin_note: str | None = None


def _serialize_request(r: models.UsernameChangeRequest, requester: models.User | None) -> dict:
    return {
        "id": r.id,
        "user_id": r.user_id,
        "current_username": r.current_username,
        "requested_username": r.requested_username,
        "reason": r.reason,
        "status": r.status,
        "admin_note": r.admin_note,
        "reviewed_by": r.reviewed_by,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "resolved_at": r.resolved_at.isoformat() if r.resolved_at else None,
        # Convenience fields so the admin UI can show the operator without a second fetch.
        "requester_email": requester.email if requester else None,
        "requester_role": requester.role if requester else None,
    }


def _attach_requester(db: Session, rows: list[models.UsernameChangeRequest]) -> list[dict]:
    if not rows:
        return []
    user_ids = {r.user_id for r in rows}
    users = {u.id: u for u in db.query(models.User).filter(models.User.id.in_(user_ids)).all()}
    return [_serialize_request(r, users.get(r.user_id)) for r in rows]


@router.get("/username-requests")
def list_username_requests(
    status_filter: str = Query("pending", alias="status"),
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    q = db.query(models.UsernameChangeRequest)
    if status_filter and status_filter != "all":
        q = q.filter(models.UsernameChangeRequest.status == status_filter)
    rows = q.order_by(models.UsernameChangeRequest.created_at.desc()).all()
    return _attach_requester(db, rows)


@router.post("/username-requests/{request_id}/approve")
def approve_username_request(
    request_id: str,
    body: UsernameRequestReview | None = None,
    db: Session = Depends(get_db),
    me: models.User = Depends(require_admin),
):
    req = db.query(models.UsernameChangeRequest).filter(models.UsernameChangeRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.status != "pending":
        raise HTTPException(status_code=400, detail="Request is not pending")

    user = db.query(models.User).filter(models.User.id == req.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Requesting user no longer exists")

    # Re-check uniqueness at approval time — a signup or admin edit could have
    # claimed this name between request and review.
    clash = db.query(models.User).filter(
        models.User.username == req.requested_username,
        models.User.id != user.id,
    ).first()
    if clash:
        raise HTTPException(status_code=409, detail="Username is no longer available")

    user.username = req.requested_username
    req.status = "approved"
    req.admin_note = (body.admin_note.strip() if body and body.admin_note else None) or None
    req.reviewed_by = me.id
    req.resolved_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(req)
    db.refresh(user)
    return _serialize_request(req, user)


@router.post("/username-requests/{request_id}/reject")
def reject_username_request(
    request_id: str,
    body: UsernameRequestReview | None = None,
    db: Session = Depends(get_db),
    me: models.User = Depends(require_admin),
):
    req = db.query(models.UsernameChangeRequest).filter(models.UsernameChangeRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.status != "pending":
        raise HTTPException(status_code=400, detail="Request is not pending")

    req.status = "rejected"
    req.admin_note = (body.admin_note.strip() if body and body.admin_note else None) or None
    req.reviewed_by = me.id
    req.resolved_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(req)
    user = db.query(models.User).filter(models.User.id == req.user_id).first()
    return _serialize_request(req, user)


@router.delete("/users/{user_id}", status_code=204)
def delete_user(
    user_id: str,
    db: Session = Depends(get_db),
    me: models.User = Depends(require_admin),
):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == me.id:
        raise HTTPException(status_code=400, detail="You cannot delete your own account")
    db.delete(user)
    db.commit()
