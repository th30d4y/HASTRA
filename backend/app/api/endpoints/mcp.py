from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional, List
from pydantic import BaseModel
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.models.mcp_server import McpServer

router = APIRouter()


class McpCreate(BaseModel):
    name: str
    description: Optional[str] = None
    transport: str = "http"
    endpoint: Optional[str] = None
    auth_type: Optional[str] = None
    allowed_domains: Optional[List[str]] = None
    blocked_domains: Optional[List[str]] = None
    max_actions: int = 50
    timeout_seconds: int = 30
    headless: bool = True


@router.get("")
async def list_servers(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    servers = db.query(McpServer).filter(McpServer.user_id == current_user.id).all()
    return [{"id": s.id, "name": s.name, "transport": s.transport, "endpoint": s.endpoint, "is_connected": s.is_connected, "max_actions": s.max_actions} for s in servers]


@router.post("")
async def create_server(req: McpCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    server = McpServer(user_id=current_user.id, **req.model_dump())
    db.add(server)
    db.commit()
    db.refresh(server)
    return {"id": server.id, "name": server.name}


@router.delete("/{server_id}")
async def delete_server(server_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    server = db.query(McpServer).filter(McpServer.id == server_id, McpServer.user_id == current_user.id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    db.delete(server)
    db.commit()
    return {"status": "deleted"}
