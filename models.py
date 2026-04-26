import datetime
from sqlalchemy import Column, String, Integer, Float, Boolean, DateTime
from database import Base

class User(Base):
    __tablename__ = "users"
    id = Column(String, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    email = Column(String, unique=True, index=True, nullable=True)
    password_hash = Column(String)
    google_id = Column(String, unique=True, nullable=True)
    auth_provider = Column(String, default="local") # local, google
    role = Column(String, default="user") # admin, user
    # AdminDash: airport assignment
    airport_iata = Column(String, nullable=True)
    airport_icao = Column(String, nullable=True)
    airport_name = Column(String, nullable=True)
    airport_city = Column(String, nullable=True)
    airport_country = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

class Camera(Base):
    __tablename__ = "cameras"
    id = Column(String, primary_key=True, index=True)
    name = Column(String)
    source = Column(String)
    zone = Column(String, default="General")
    is_runway = Column(Boolean, default=False)
    model_type = Column(String, default="yolo")
    status = Column(String, default="active")
    created_by = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

class SystemSetting(Base):
    __tablename__ = "system_settings"
    id = Column(Integer, primary_key=True, index=True)
    confidence_threshold = Column(Float, default=0.60)
    iou_threshold = Column(Float, default=0.45)
    default_model = Column(String, default="yolo")
    alert_sensitivity = Column(String, default="Normal")
    log_retention_days = Column(Integer, default=30)
    inference_mode = Column(String, default="hybrid")
    updated_by = Column(String, nullable=True)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

class Alert(Base):
    __tablename__ = "alerts"
    id = Column(String, primary_key=True, index=True)
    camera_id = Column(String, index=True)
    zone = Column(String)
    severity = Column(String)
    class_name = Column(String, default="Bird")
    confidence = Column(Float, nullable=True)
    model_used = Column(String)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)
    status = Column(String, default="active")

# UsernameRequest: user-initiated rename, pending until an admin approves/rejects.
class UsernameChangeRequest(Base):
    __tablename__ = "username_change_requests"
    id = Column(String, primary_key=True, index=True)
    user_id = Column(String, index=True)
    current_username = Column(String)
    requested_username = Column(String, index=True)
    reason = Column(String, nullable=True)
    status = Column(String, default="pending", index=True)  # pending | approved | rejected
    admin_note = Column(String, nullable=True)
    reviewed_by = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    resolved_at = Column(DateTime, nullable=True)


class DetectionLog(Base):
    __tablename__ = "detection_logs"
    id = Column(String, primary_key=True, index=True)
    camera_id = Column(String, index=True)
    zone = Column(String)
    class_name = Column(String, default="Bird")
    confidence = Column(Float)
    bbox = Column(String) # JSON string or comma-separated
    model_used = Column(String)
    media_type = Column(String, default="stream") # stream, image, video
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


# TestHistory: server-side storage of per-user upload runs so history follows
# the user across browsers/devices instead of living in localStorage/IndexedDB.
# Annotated media bytes live on disk under UPLOAD_HISTORY_DIR/<user_id>/<id>.<ext>;
# the row stores the path plus metadata + an inline base64 thumbnail.
class UploadHistory(Base):
    __tablename__ = "upload_history"
    id = Column(String, primary_key=True, index=True)
    user_id = Column(String, index=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, index=True)
    kind = Column(String)  # image | video
    filename = Column(String)
    file_size = Column(Integer)
    engine = Column(String)  # yolo | rtdetr | auto
    metadata_json = Column(String)
    media_path = Column(String)
    media_mime = Column(String)
    thumbnail_b64 = Column(String, nullable=True)
