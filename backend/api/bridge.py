"""The link between the recording device and the platform, made visible.

The laptop app (bridge) calls POST /api/bridge/heartbeat every few seconds with its API token and what the listener
reports (device plugged in, recording, live mic level). The web app reads GET /api/bridge/status to show
"recording device connected" and the last upload, so a broken link is never silent.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, field_validator

from api.deps import current_user, db
from services.users import iso

router = APIRouter(prefix="/api/bridge", tags=["laptop link"])

ONLINE_SEC = 30          # a laptop app that sent a heartbeat this recently is "connected"
LISTENER_FRESH_SEC = 15  # the listener's own status is trusted if it is this recent


class ListenerIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    running: bool = False
    device_connected: bool = False
    recording: bool = False
    firmware: str | None = Field(default=None, max_length=20)
    mic: str | None = Field(default=None, max_length=20)
    session_notes: int = Field(default=0, ge=0, le=100000)
    levels: list[float] = Field(default_factory=list)
    age_sec: float = Field(default=0.0, ge=0)

    @field_validator("levels")
    @classmethod
    def _levels(cls, v: list[float]) -> list[float]:
        return [max(-100.0, min(0.0, float(x))) for x in v][-32:]


class HeartbeatIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    bridge_version: str | None = Field(default=None, max_length=20)
    computer: str | None = Field(default=None, max_length=60)
    sessions_dir_ok: bool = True
    listener: ListenerIn | None = None


def _age(ts: str | None) -> float | None:
    if not ts:
        return None
    try:
        return (datetime.now(timezone.utc) - datetime.fromisoformat(ts)).total_seconds()
    except ValueError:
        return None


@router.post("/heartbeat")
def heartbeat(body: HeartbeatIn, request: Request, user=Depends(current_user)):
    if not request.headers.get("authorization", "").lower().startswith("bearer "):
        raise HTTPException(403, "the heartbeat comes from the laptop app, with its token")
    status = body.model_dump()
    if body.listener and body.listener.age_sec > LISTENER_FRESH_SEC:
        status["listener"] = {**status["listener"], "running": False, "device_connected": False, "recording": False}
    with db(request).tx() as c:
        c.execute("UPDATE api_tokens SET last_seen_at=?, status_json=? WHERE id=?",
                  (iso(), json.dumps(status, ensure_ascii=False), user["_tid"]))
    return {"ok": True, "account": {"name": user["name"], "email": user["email"]}}


@router.get("/status")
def status(request: Request, user=Depends(current_user)):
    d = db(request)
    computers = []
    for r in d.all("SELECT id, label, created_at, last_used_at, last_seen_at, status_json FROM api_tokens WHERE user_id=? ORDER BY id",
                   (user["id"],)):
        age = _age(r["last_seen_at"])
        st = json.loads(r["status_json"]) if r["status_json"] else {}
        online = age is not None and age <= ONLINE_SEC
        li = (st.get("listener") or {}) if online else {}
        computers.append({"id": r["id"], "label": r["label"], "computer": st.get("computer"), "created_at": r["created_at"],
                          "last_seen_at": r["last_seen_at"], "online": online,
                          "listener_running": bool(li.get("running")), "device_connected": bool(li.get("device_connected")),
                          "recording": bool(li.get("recording")), "firmware": li.get("firmware"), "mic": li.get("mic"),
                          "levels": li.get("levels") or [], "sessions_dir_ok": st.get("sessions_dir_ok", True)})
    up = d.one("SELECT MAX(updated_at) AS t, COUNT(*) AS n FROM sessions WHERE owner_id=?", (user["id"],))
    best = next((c for c in computers if c["online"] and c["device_connected"]), None) or next((c for c in computers if c["online"]), None)
    return {"linked": bool(computers), "online": best is not None, "device_connected": bool(best and best["device_connected"]),
            "recording": bool(best and best["recording"]), "listener_running": bool(best and best["listener_running"]),
            "levels": (best or {}).get("levels", []), "firmware": (best or {}).get("firmware"),
            "last_upload_at": up["t"], "uploads": up["n"], "computers": computers}
