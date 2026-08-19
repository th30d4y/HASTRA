from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import Optional
from app.core.database import get_db
from app.core.dependencies import require_admin
from app.models.user import User
from app.models.agent import Agent
from app.models.test_run import TestRun
from app.models.finding import Finding
from app.models.audit_log import AuditLog
from app.models.recording import Recording
from app.models.scenario import Scenario

router = APIRouter()


@router.get("/stats")
async def get_stats(db: Session = Depends(get_db), _=Depends(require_admin)):
    return {
        "total_users": db.query(User).count(),
        "active_users": db.query(User).filter(User.is_active == True).count(),
        "total_agents": db.query(Agent).count(),
        "total_test_runs": db.query(TestRun).count(),
        "total_findings": db.query(Finding).count(),
        "critical_findings": db.query(Finding).filter(Finding.severity == "CRITICAL").count(),
        "total_scenarios": db.query(Scenario).count(),
        "total_recordings": db.query(Recording).count(),
    }


@router.get("/users")
async def list_users(db: Session = Depends(get_db), _=Depends(require_admin)):
    users = db.query(User).order_by(User.created_at.desc()).all()
    return [{"id": u.id, "email": u.email, "full_name": u.full_name, "role": u.role,
             "is_active": u.is_active, "created_at": u.created_at} for u in users]


@router.patch("/users/{user_id}/toggle")
async def toggle_user(user_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    from fastapi import HTTPException
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_active = not user.is_active
    db.commit()
    return {"id": user.id, "is_active": user.is_active}


@router.get("/logs")
async def get_logs(
    action: Optional[str] = None,
    resource_type: Optional[str] = None,
    user_id: Optional[int] = None,
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=50, le=200),
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    """Return paginated audit logs with optional filtering."""
    q = db.query(AuditLog).order_by(AuditLog.created_at.desc())
    if action:
        q = q.filter(AuditLog.action.ilike(f"%{action}%"))
    if resource_type:
        q = q.filter(AuditLog.resource_type == resource_type)
    if user_id:
        q = q.filter(AuditLog.user_id == user_id)

    total = q.count()
    logs = q.offset((page - 1) * per_page).limit(per_page).all()

    return {
        "total": total,
        "page": page,
        "per_page": per_page,
        "logs": [
            {
                "id": log.id,
                "action": log.action,
                "user_id": log.user_id,
                "resource_type": log.resource_type,
                "resource_id": log.resource_id,
                "details": log.details,
                "ip_address": log.ip_address,
                "created_at": log.created_at,
            }
            for log in logs
        ],
    }
