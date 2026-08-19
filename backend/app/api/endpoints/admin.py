from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.dependencies import require_admin
from app.models.user import User
from app.models.agent import Agent
from app.models.test_run import TestRun
from app.models.finding import Finding

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
    }


@router.get("/users")
async def list_users(db: Session = Depends(get_db), _=Depends(require_admin)):
    users = db.query(User).order_by(User.created_at.desc()).all()
    return [{"id": u.id, "email": u.email, "full_name": u.full_name, "role": u.role, "is_active": u.is_active, "created_at": u.created_at} for u in users]


@router.patch("/users/{user_id}/toggle")
async def toggle_user(user_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="User not found")
    user.is_active = not user.is_active
    db.commit()
    return {"id": user.id, "is_active": user.is_active}
