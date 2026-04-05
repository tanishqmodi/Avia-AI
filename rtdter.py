"""
RTDTER — Real-Time Detection, Tracking, and Event Response engine.

Zone-aware: runway-specific logic (zone polygon, approach detection, intrusion)
is ONLY activated when is_runway=True. Non-runway cameras get density alerts
and basic tracking only.
"""

import time
import logging
import numpy as np
from dataclasses import dataclass, field
from typing import Optional
from collections import deque

import config as cfg

logger = logging.getLogger("rtdter")


@dataclass
class BirdTrack:
    track_id: int
    first_seen: float
    last_seen: float
    positions: deque = field(default_factory=lambda: deque(maxlen=60))
    in_zone: bool = False
    zone_entry_time: Optional[float] = None
    risk_level: int = 0  # 0=normal, 1=intrusion, 2=high risk, 3=critical

    @property
    def current_pos(self) -> Optional[np.ndarray]:
        return self.positions[-1] if self.positions else None

    @property
    def velocity(self) -> Optional[np.ndarray]:
        if len(self.positions) < 2:
            return None
        recent = list(self.positions)[-5:]
        if len(recent) < 2:
            return None
        displacement = np.array(recent[-1]) - np.array(recent[0])
        time_span = (len(recent) - 1) / max(cfg.TARGET_FPS, 1)
        if time_span <= 0:
            return None
        return displacement / time_span

    @property
    def speed(self) -> float:
        v = self.velocity
        return float(np.linalg.norm(v)) if v is not None else 0.0

    @property
    def direction_deg(self) -> Optional[float]:
        v = self.velocity
        if v is None or np.linalg.norm(v) < 1e-3:
            return None
        return float(np.degrees(np.arctan2(v[1], v[0])))

    @property
    def time_in_zone(self) -> float:
        if self.zone_entry_time is None:
            return 0.0
        return time.time() - self.zone_entry_time


@dataclass
class Alert:
    level: str          # "INTRUSION", "HIGH_RISK", "CRITICAL", "APPROACH", "DETECTION"
    track_id: Optional[int]
    message: str
    priority: int = 1   # 1-4, derived from zone
    timestamp: float = field(default_factory=time.time)


class RTDTEREngine:
    """
    Zone-aware event-response engine.

    Parameters
    ----------
    zone : str — camera zone ("Runway", "Taxiway", etc.)
    is_runway : bool — whether this camera monitors the runway
    """

    def __init__(
        self,
        zone: str = "General",
        is_runway: bool = False,
        persistence_sec: float = None,
        density_threshold: int = None,
    ):
        self.zone = zone
        self.is_runway = is_runway
        self.persistence_sec = persistence_sec or cfg.PERSISTENCE_TIME_SEC
        self.density_threshold = density_threshold or cfg.DENSITY_THRESHOLD
        self.priority = cfg.ZONE_PRIORITY.get(zone, 1)
        self.zone_label = cfg.ZONE_ALERT_LABEL.get(zone, "DETECTION")

        # Runway polygon — ONLY used when is_runway=True
        self._runway_zone_norm = cfg.RUNWAY_ZONE_NORMALIZED if is_runway else None
        self._runway_zone_px: Optional[np.ndarray] = None
        self._runway_center_px: Optional[np.ndarray] = None
        self._frame_size: Optional[tuple] = None

        self.tracks: dict[int, BirdTrack] = {}
        self.alerts: list[Alert] = []
        self._frame_alerts: list[Alert] = []

    def _scale_zone(self, w: int, h: int) -> Optional[np.ndarray]:
        """Scale runway polygon. Returns None for non-runway cameras."""
        if self._runway_zone_norm is None:
            return None
        if self._frame_size == (w, h) and self._runway_zone_px is not None:
            return self._runway_zone_px
        self._frame_size = (w, h)
        self._runway_zone_px = (self._runway_zone_norm * np.array([w, h])).astype(np.int32)
        self._runway_center_px = self._runway_zone_px.mean(axis=0)
        return self._runway_zone_px

    def _point_in_zone(self, point: np.ndarray, zone_px: np.ndarray) -> bool:
        x, y = float(point[0]), float(point[1])
        n = len(zone_px)
        inside = False
        j = n - 1
        for i in range(n):
            xi, yi = float(zone_px[i][0]), float(zone_px[i][1])
            xj, yj = float(zone_px[j][0]), float(zone_px[j][1])
            if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi) + xi):
                inside = not inside
            j = i
        return inside

    def _emit(self, level: str, track_id: Optional[int], message: str):
        alert = Alert(level=level, track_id=track_id, message=message, priority=self.priority)
        self._frame_alerts.append(alert)
        self.alerts.append(alert)
        logger.warning("[%s] [%s] ID=%s | %s", level, self.zone, track_id, message)

    def update(self, track_ids: list[int], centers: list[np.ndarray],
               frame_w: int, frame_h: int) -> list[Alert]:
        now = time.time()
        self._frame_alerts = []

        # Runway zone polygon (None for non-runway cameras)
        zone_px = self._scale_zone(frame_w, frame_h)
        active_ids = set()

        for tid, center in zip(track_ids, centers):
            active_ids.add(tid)
            center = np.array(center, dtype=np.float64)

            if tid in self.tracks:
                track = self.tracks[tid]
                track.last_seen = now
                track.positions.append(center)
            else:
                track = BirdTrack(track_id=tid, first_seen=now, last_seen=now)
                track.positions.append(center)
                self.tracks[tid] = track

            # ── Runway-only logic: zone intrusion + persistence + approach ──
            if self.is_runway and zone_px is not None:
                was_in_zone = track.in_zone
                track.in_zone = self._point_in_zone(center, zone_px)

                if track.in_zone and not was_in_zone:
                    track.zone_entry_time = now
                    track.risk_level = max(track.risk_level, 1)
                    self._emit("INTRUSION", tid,
                               f"Bird entered runway zone at ({center[0]:.0f}, {center[1]:.0f})")

                if not track.in_zone and was_in_zone:
                    track.zone_entry_time = None
                    track.risk_level = 0

                # Persistence
                if track.in_zone and track.zone_entry_time is not None:
                    dwell = now - track.zone_entry_time
                    if dwell > self.persistence_sec and track.risk_level < 2:
                        track.risk_level = 2
                        self._emit("HIGH_RISK", tid,
                                   f"Bird in runway zone for {dwell:.1f}s (>{self.persistence_sec}s)")

                # Approach analysis
                if not track.in_zone and self._runway_center_px is not None:
                    vel = track.velocity
                    if vel is not None and np.linalg.norm(vel) > 5:
                        to_runway = self._runway_center_px - center
                        dist = np.linalg.norm(to_runway)
                        if dist > 1:
                            cos_a = np.dot(vel, to_runway) / (np.linalg.norm(vel) * dist)
                            cos_a = np.clip(cos_a, -1, 1)
                            angle = np.degrees(np.arccos(cos_a))
                            if angle < cfg.APPROACH_ANGLE_THRESH:
                                spd = np.dot(vel, to_runway / dist)
                                if spd > cfg.VELOCITY_RISK_THRESH:
                                    track.risk_level = max(track.risk_level, 1)
                                    self._emit("APPROACH", tid,
                                               f"Approaching runway at {spd:.0f}px/s, angle={angle:.0f}")

            # ── Non-runway cameras: basic detection alert ──
            elif not self.is_runway:
                # Just track, no zone polygon logic
                track.in_zone = False
                track.risk_level = 0

        # ── Density alert (all zones) ──
        n_active = len(active_ids)
        if n_active > self.density_threshold:
            label = "CRITICAL" if self.is_runway else "HIGH_DENSITY"
            self._emit(label, None,
                       f"High bird density in {self.zone}: {n_active} birds (threshold={self.density_threshold})")

        # ── Runway: density inside zone ──
        if self.is_runway:
            birds_in_zone = sum(1 for t in active_ids if self.tracks.get(t, BirdTrack(0, 0, 0)).in_zone)
            if birds_in_zone > self.density_threshold:
                self._emit("CRITICAL", None,
                           f"{birds_in_zone} birds inside runway zone (threshold={self.density_threshold})")

        # ── Prune stale tracks ──
        stale_cutoff = now - (cfg.TRACK_BUFFER / max(cfg.TARGET_FPS, 1))
        stale_ids = [tid for tid, t in self.tracks.items()
                     if t.last_seen < stale_cutoff and tid not in active_ids]
        for tid in stale_ids:
            del self.tracks[tid]

        return self._frame_alerts

    def get_active_tracks(self) -> list[BirdTrack]:
        return list(self.tracks.values())

    def get_zone_polygon_px(self, frame_w: int, frame_h: int) -> Optional[np.ndarray]:
        """Returns runway polygon ONLY for runway cameras, else None."""
        return self._scale_zone(frame_w, frame_h)

    def get_stats(self) -> dict:
        active = self.get_active_tracks()
        in_zone = [t for t in active if t.in_zone]
        return {
            "active_birds": len(active),
            "birds_in_zone": len(in_zone),
            "high_risk": sum(1 for t in active if t.risk_level >= 2),
            "total_alerts": len(self.alerts),
            "max_risk": max((t.risk_level for t in active), default=0),
            "zone": self.zone,
            "is_runway": self.is_runway,
        }
