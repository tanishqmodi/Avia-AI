import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# Use a specific PostgreSQL URL or fallback to Postgres on localhost
DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://localhost/skyguard")

try:
    engine = create_engine(DATABASE_URL)
    # Test connection
    engine.connect()
except Exception as e:
    print(f"Warning: Failed to connect to PostgreSQL at {DATABASE_URL}.")
    print("Falling back to SQLite (skyguard.db) for development/testing.")
    DATABASE_URL = "sqlite:///skyguard.db"
    # sqlite needs check_same_thread=False for FastAPI background tasks
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
