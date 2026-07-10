"""
database.py — SQLAlchemy engine, session factory, ORM models, and init_db().

Schema is locked from Day 1 design. Tables are created on first startup via
init_db() called from main.py lifespan event.
"""

import os
from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    Integer,
    String,
    Text,
    create_engine,
)
from sqlalchemy.orm import DeclarativeBase, sessionmaker

# ---------------------------------------------------------------------------
# Engine & session
# ---------------------------------------------------------------------------

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # backend/
DB_PATH = os.path.join(BASE_DIR, "fusioniq.db")
DATABASE_URL = f"sqlite:///{DB_PATH}"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},  # required for SQLite + FastAPI threads
    echo=False,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


# ---------------------------------------------------------------------------
# ORM Models (mirrors the Day-1 agreed SQL schema)
# ---------------------------------------------------------------------------


class Zone(Base):
    """Static plant zone definitions — populated once at startup from scenario.json."""
    __tablename__ = "zones"

    id = Column(String, primary_key=True)          # e.g. "zone-alpha"
    name = Column(String, nullable=False)           # e.g. "Zone Alpha — Compressor Hall"
    x = Column(Float, nullable=False)               # grid x position for heatmap
    y = Column(Float, nullable=False)               # grid y position for heatmap
    hazard_class = Column(String, nullable=False)   # HIGH_RISK | MEDIUM_RISK | LOW_RISK


class GasReading(Base):
    """Time-series gas sensor readings per zone."""
    __tablename__ = "gas_readings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    zone_id = Column(String, nullable=False)        # FK → zones.id
    ppm = Column(Float, nullable=False)             # measured concentration
    threshold = Column(Float, nullable=False)       # configured alarm threshold
    ts = Column(DateTime, default=datetime.utcnow)


class Permit(Base):
    """Work permits — hot-work, confined-space entry, etc."""
    __tablename__ = "permits"

    id = Column(Integer, primary_key=True, autoincrement=True)
    permit_ref = Column(String, nullable=True)      # human permit ID e.g. "P-2026-042"
    zone_id = Column(String, nullable=False)        # FK → zones.id
    type = Column(String, nullable=False)           # HOT_WORK | CONFINED_SPACE | GENERAL
    status = Column(String, nullable=False)         # ACTIVE | CLOSED | REVOKED
    issued_ts = Column(DateTime, default=datetime.utcnow)
    conflicts_with = Column(String, nullable=True)  # free-text conflict descriptor


class Worker(Base):
    """Worker last-known zone, including confined-space entry timestamps."""
    __tablename__ = "workers"

    id = Column(Integer, primary_key=True, autoincrement=True)
    worker_id = Column(String, nullable=False)      # e.g. "W-101"
    name = Column(String, nullable=False)
    zone_id = Column(String, nullable=False)        # FK → zones.id (current location)
    confined_space_entry_ts = Column(DateTime, nullable=True)  # set when enters confined space


class Maintenance(Base):
    """Maintenance activity per zone."""
    __tablename__ = "maintenance"

    id = Column(Integer, primary_key=True, autoincrement=True)
    zone_id = Column(String, nullable=False)        # FK → zones.id
    active = Column(Boolean, nullable=False, default=False)
    ts = Column(DateTime, default=datetime.utcnow)


class HazardEvent(Base):
    """
    Written each time the hazard level changes. Immutable audit log.
    signals_json stores the raw sensor readings that triggered the event.
    """
    __tablename__ = "hazard_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    zone_id = Column(String, nullable=False)        # FK → zones.id
    score = Column(Float, nullable=False)           # 0–100 compound score
    level = Column(String, nullable=False)          # Safe | Elevated | High | Critical
    signals_json = Column(Text, nullable=True)      # JSON blob of contributing signals
    explanation = Column(Text, nullable=True)       # Gemini-generated explanation (cached)
    ts = Column(DateTime, default=datetime.utcnow)


# ---------------------------------------------------------------------------
# Database initialisation
# ---------------------------------------------------------------------------


def init_db() -> None:
    """Create all tables if they don't already exist, then seed zone data."""
    Base.metadata.create_all(bind=engine)
    _seed_zones()


def _seed_zones() -> None:
    """
    Populate the zones table from the hardcoded scenario definition if empty.
    This is idempotent — safe to call on every startup.
    """
    zones_data = [
        Zone(id="zone-alpha", name="Zone Alpha — Compressor Hall", x=2.0, y=1.0, hazard_class="HIGH_RISK"),
        Zone(id="zone-beta",  name="Zone Beta — Control Room",     x=0.0, y=0.0, hazard_class="LOW_RISK"),
        Zone(id="zone-gamma", name="Zone Gamma — Storage Bay",     x=4.0, y=2.0, hazard_class="MEDIUM_RISK"),
    ]

    with SessionLocal() as session:
        existing_ids = {row.id for row in session.query(Zone.id).all()}
        for zone in zones_data:
            if zone.id not in existing_ids:
                session.add(zone)
        session.commit()


# ---------------------------------------------------------------------------
# FastAPI dependency — yields a session and guarantees cleanup
# ---------------------------------------------------------------------------


def get_db():
    """Yield a database session; close it when the request is done."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
