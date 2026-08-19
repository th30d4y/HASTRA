from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from pydantic import BaseModel
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.models.tool import Tool
import json

router = APIRouter()


class ToolCreate(BaseModel):
    name: str
    description: Optional[str] = None
    input_schema: Optional[dict] = None
    output_schema: Optional[dict] = None
    permission_level: str = "user"
    risk_level: str = "SAFE"
    mock_response: Optional[str] = None
    real_endpoint: Optional[str] = None
    execution_mode: str = "MOCK"
    requires_confirmation: bool = False
    requires_role: Optional[str] = None


@router.get("")
async def list_tools(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    tools = db.query(Tool).filter(Tool.user_id == current_user.id).all()
    return [{"id": t.id, "name": t.name, "description": t.description, "risk_level": t.risk_level, "execution_mode": t.execution_mode, "requires_confirmation": t.requires_confirmation, "is_demo": t.is_demo, "input_schema": t.input_schema} for t in tools]


@router.post("")
async def create_tool(req: ToolCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    tool = Tool(user_id=current_user.id, **req.model_dump())
    db.add(tool)
    db.commit()
    db.refresh(tool)
    return {"id": tool.id, "name": tool.name, "risk_level": tool.risk_level}


@router.put("/{tool_id}")
async def update_tool(tool_id: int, req: ToolCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    tool = db.query(Tool).filter(Tool.id == tool_id, Tool.user_id == current_user.id).first()
    if not tool:
        raise HTTPException(status_code=404, detail="Tool not found")
    for k, v in req.model_dump().items():
        setattr(tool, k, v)
    db.commit()
    return {"status": "updated"}


@router.delete("/{tool_id}")
async def delete_tool(tool_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    tool = db.query(Tool).filter(Tool.id == tool_id, Tool.user_id == current_user.id).first()
    if not tool:
        raise HTTPException(status_code=404, detail="Tool not found")
    db.delete(tool)
    db.commit()
    return {"status": "deleted"}


@router.post("/{agent_id}/attach/{tool_id}")
async def attach_tool(agent_id: int, tool_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    from app.models.agent import Agent
    agent = db.query(Agent).filter(Agent.id == agent_id, Agent.user_id == current_user.id).first()
    tool = db.query(Tool).filter(Tool.id == tool_id, Tool.user_id == current_user.id).first()
    if not agent or not tool:
        raise HTTPException(status_code=404, detail="Not found")
    if tool not in agent.tools:
        agent.tools.append(tool)
        db.commit()
    return {"status": "attached"}
