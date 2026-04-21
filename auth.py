import os
import uuid
import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from jose import JWTError, jwt
from pydantic import BaseModel
import bcrypt

import models
from database import get_db

# Security settings
# JWT_SECRET_KEY must be set in the environment before the server starts —
# no fallback, because a shared default would let anyone who cloned the repo
# forge tokens for every default install. See .env.example for how to generate one.
SECRET_KEY = os.environ.get("JWT_SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError(
        "JWT_SECRET_KEY is not set. Generate one with "
        "`python -c 'import secrets; print(secrets.token_hex(32))'` "
        "and export it before starting the server."
    )
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7 # 7 days

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

router = APIRouter(prefix="/api/auth", tags=["auth"])

def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))
    except Exception:
        return False

def get_password_hash(password: str) -> str:
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
    return hashed.decode('utf-8')

def create_access_token(data: dict, expires_delta: datetime.timedelta | None = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.datetime.utcnow() + expires_delta
    else:
        expire = datetime.datetime.utcnow() + datetime.timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

# Pydantic models for auth
class Token(BaseModel):
    access_token: str
    token_type: str
    user: dict

class GoogleAuthRequest(BaseModel):
    email: str
    name: str
    googleId: str

class UserCreate(BaseModel):
    username: str
    password: str
    email: str | None = None

# EditProfile: self-service profile update payload.
class SelfUpdate(BaseModel):
    email: str | None = None
    current_password: str | None = None
    new_password: str | None = None

# UsernameRequest: user-submitted rename payload.
class UsernameRequestCreate(BaseModel):
    requested_username: str
    reason: str | None = None

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if user is None:
        raise credentials_exception
    return user


@router.post("/login", response_model=Token)
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    # allow login with username or email
    user = db.query(models.User).filter((models.User.username == form_data.username) | (models.User.email == form_data.username)).first()
    if not user or not user.password_hash or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token_expires = datetime.timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.id, "role": user.role}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer", "user": {"id": user.id, "username": user.username, "role": user.role}}

@router.post("/google", response_model=Token)
async def google_auth(request: GoogleAuthRequest, db: Session = Depends(get_db)):
    # Simulated Google Auth: We trust the client's assertion for this demo.
    # In production, verify the actual google token with google.oauth2.id_token
    user = db.query(models.User).filter(models.User.google_id == request.googleId).first()
    
    if not user:
        # Check if email exists
        user = db.query(models.User).filter(models.User.email == request.email).first()
        if user:
            user.google_id = request.googleId
            db.commit()
            db.refresh(user)
        else:
            # Create new user
            user = models.User(
                id=str(uuid.uuid4()),
                username=request.name.replace(" ", "") + "_" + str(uuid.uuid4())[:4],
                email=request.email,
                google_id=request.googleId,
                auth_provider="google",
                role="user"
            )
            db.add(user)
            db.commit()
            db.refresh(user)
            
    access_token_expires = datetime.timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.id, "role": user.role}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer", "user": {"id": user.id, "username": user.username, "role": user.role}}

def _serialize_self(u: models.User) -> dict:
    # EditProfile: full self profile (airport + timestamps) for the profile page.
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
        "updated_at": u.updated_at.isoformat() if u.updated_at else None,
    }


@router.get("/me")
async def read_users_me(current_user: models.User = Depends(get_current_user)):
    return _serialize_self(current_user)


@router.put("/me")
async def update_self(
    body: SelfUpdate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # EditProfile: user-editable fields are email + password. Role/airport stay admin-only.
    data = body.model_dump(exclude_unset=True)

    if "email" in data:
        new_email = (data["email"] or "").strip() or None
        if new_email and new_email != current_user.email:
            clash = db.query(models.User).filter(
                models.User.email == new_email,
                models.User.id != current_user.id,
            ).first()
            if clash:
                raise HTTPException(status_code=409, detail="Email already in use")
        current_user.email = new_email

    new_pw = data.get("new_password")
    if new_pw:
        if current_user.auth_provider != "local":
            raise HTTPException(status_code=400, detail="Password is managed by your SSO provider")
        if len(new_pw) < 4:
            raise HTTPException(status_code=400, detail="Password must be at least 4 characters")
        if not current_user.password_hash or not verify_password(data.get("current_password") or "", current_user.password_hash):
            raise HTTPException(status_code=400, detail="Current password is incorrect")
        current_user.password_hash = get_password_hash(new_pw)

    db.commit()
    db.refresh(current_user)
    return _serialize_self(current_user)

# UsernameRequest: serialize a change request for API responses.
def _serialize_username_request(r: models.UsernameChangeRequest) -> dict:
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
    }


@router.get("/username-requests")
async def list_my_username_requests(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # UsernameRequest: own history, newest first.
    rows = (
        db.query(models.UsernameChangeRequest)
        .filter(models.UsernameChangeRequest.user_id == current_user.id)
        .order_by(models.UsernameChangeRequest.created_at.desc())
        .all()
    )
    return [_serialize_username_request(r) for r in rows]


@router.post("/username-requests", status_code=201)
async def create_username_request(
    body: UsernameRequestCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # UsernameRequest: user submits a rename request. Validates the shape and
    # rejects obvious conflicts up front; the final uniqueness check re-runs
    # at approval time so a racing signup can't sneak in.
    requested = (body.requested_username or "").strip()
    if len(requested) < 3:
        raise HTTPException(status_code=400, detail="Username must be at least 3 characters")
    if len(requested) > 40:
        raise HTTPException(status_code=400, detail="Username is too long (max 40)")
    if requested == current_user.username:
        raise HTTPException(status_code=400, detail="That is already your username")

    existing_pending = (
        db.query(models.UsernameChangeRequest)
        .filter(
            models.UsernameChangeRequest.user_id == current_user.id,
            models.UsernameChangeRequest.status == "pending",
        )
        .first()
    )
    if existing_pending:
        raise HTTPException(status_code=409, detail="You already have a pending request. Cancel it first to submit a new one.")

    clash = db.query(models.User).filter(models.User.username == requested).first()
    if clash:
        raise HTTPException(status_code=409, detail="Username already taken")

    req = models.UsernameChangeRequest(
        id=str(uuid.uuid4()),
        user_id=current_user.id,
        current_username=current_user.username,
        requested_username=requested,
        reason=(body.reason or "").strip() or None,
        status="pending",
    )
    db.add(req)
    db.commit()
    db.refresh(req)
    return _serialize_username_request(req)


@router.delete("/username-requests/{request_id}", status_code=204)
async def cancel_username_request(
    request_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # UsernameRequest: user cancels their own *pending* request.
    req = db.query(models.UsernameChangeRequest).filter(models.UsernameChangeRequest.id == request_id).first()
    if not req or req.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.status != "pending":
        raise HTTPException(status_code=400, detail="Only pending requests can be cancelled")
    db.delete(req)
    db.commit()


@router.post("/signup", response_model=Token)
async def create_user(user: UserCreate, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.username == user.username).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Username already registered")
    
    new_user = models.User(
        id=str(uuid.uuid4()),
        username=user.username,
        email=user.email,
        password_hash=get_password_hash(user.password),
        role="user"
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    access_token_expires = datetime.timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": new_user.id, "role": new_user.role}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer", "user": {"id": new_user.id, "username": new_user.username, "role": new_user.role}}
