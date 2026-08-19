from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional, List
from pydantic import BaseModel
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.models.scenario import Scenario, ScenarioStep, ScenarioAssertion

router = APIRouter()


class ScenarioCreate(BaseModel):
    agent_id: int
    name: str
    description: Optional[str] = None
    category: str = "normal"
    risk_level: str = "LOW"
    user_input: str
    expected_behavior: Optional[str] = None
    tags: Optional[List[str]] = None


class GenerateRequest(BaseModel):
    agent_id: int
    count: int = 10
    categories: Optional[List[str]] = None


@router.get("")
async def list_scenarios(agent_id: Optional[int] = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    q = db.query(Scenario).filter(Scenario.user_id == current_user.id)
    if agent_id:
        q = q.filter(Scenario.agent_id == agent_id)
    scenarios = q.order_by(Scenario.created_at.desc()).all()
    return [{"id": s.id, "name": s.name, "category": s.category, "risk_level": s.risk_level, "user_input": s.user_input, "is_generated": s.is_generated, "is_demo": s.is_demo, "tags": s.tags, "created_at": s.created_at} for s in scenarios]


@router.post("")
async def create_scenario(req: ScenarioCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    scenario = Scenario(user_id=current_user.id, **req.model_dump())
    db.add(scenario)
    db.commit()
    db.refresh(scenario)
    return {"id": scenario.id, "name": scenario.name}


@router.get("/{scenario_id}")
async def get_scenario(scenario_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    s = db.query(Scenario).filter(Scenario.id == scenario_id, Scenario.user_id == current_user.id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Not found")
    return {"id": s.id, "name": s.name, "description": s.description, "category": s.category, "risk_level": s.risk_level, "user_input": s.user_input, "expected_behavior": s.expected_behavior, "preconditions": s.preconditions, "tags": s.tags, "is_generated": s.is_generated, "steps": [{"id": st.id, "order_index": st.order_index, "step_type": st.step_type, "content": st.content} for st in s.steps], "assertions": [{"id": a.id, "assertion_type": a.assertion_type, "description": a.description} for a in s.assertions]}


@router.post("/generate")
async def generate_scenarios(req: GenerateRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    from app.models.agent import Agent
    from app.models.tool import Tool
    from app.services.scenario_generator import generate_scenarios_for_agent
    agent = db.query(Agent).filter(Agent.id == req.agent_id, Agent.user_id == current_user.id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    tools = agent.tools
    scenarios = generate_scenarios_for_agent(agent, tools, req.categories or [], req.count)
    created = []
    for s_data in scenarios:
        s = Scenario(
            user_id=current_user.id,
            agent_id=req.agent_id,
            name=s_data["name"],
            description=s_data.get("description"),
            category=s_data["category"],
            risk_level=s_data["risk_level"],
            user_input=s_data["user_input"],
            expected_behavior=s_data["expected_behavior"],
            is_generated=True,
            tags=s_data.get("tags", []),
        )
        db.add(s)
        db.flush()
        for assertion in s_data.get("assertions", []):
            a = ScenarioAssertion(scenario_id=s.id, assertion_type=assertion["type"], description=assertion["description"], config=assertion.get("config"))
            db.add(a)
        created.append({"id": s.id, "name": s.name, "category": s.category, "risk_level": s.risk_level})
    db.commit()
    return {"generated": len(created), "scenarios": created}
