from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.models.agent import Agent, AgentVersion

router = APIRouter()


class AgentCreate(BaseModel):
    name: str
    description: Optional[str] = None
    system_prompt: Optional[str] = None
    provider_id: Optional[int] = None
    api_key_id: Optional[int] = None
    model_id: Optional[str] = None
    temperature: float = 0.7
    max_tokens: int = 2048
    endpoint: Optional[str] = None
    environment: str = "sandbox"


class AgentUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    system_prompt: Optional[str] = None
    provider_id: Optional[int] = None
    api_key_id: Optional[int] = None
    model_id: Optional[str] = None
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None
    endpoint: Optional[str] = None
    environment: Optional[str] = None


class AgentChatMessage(BaseModel):
    role: str
    content: str


class AgentChatRequest(BaseModel):
    messages: List[AgentChatMessage]


def _agent_dict(agent: Agent) -> dict:
    return {
        "id": agent.id,
        "name": agent.name,
        "description": agent.description,
        "system_prompt": agent.system_prompt,
        "provider_id": agent.provider_id,
        "api_key_id": agent.api_key_id,
        "model_id": agent.model_id,
        "temperature": agent.temperature,
        "max_tokens": agent.max_tokens,
        "endpoint": agent.endpoint,
        "environment": agent.environment,
        "is_demo": agent.is_demo,
        "current_version": agent.current_version,
        "reliability_score": agent.reliability_score,
        "security_score": agent.security_score,
        "last_tested_at": agent.last_tested_at,
        "created_at": agent.created_at,
        "tool_count": len(agent.tools),
        "mcp_count": len(agent.mcp_servers),
        "tools": [{"id": t.id, "name": t.name, "risk_level": t.risk_level, "requires_confirmation": t.requires_confirmation} for t in agent.tools],
    }


@router.get("")
async def list_agents(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    agents = db.query(Agent).filter(Agent.user_id == current_user.id).all()
    return [_agent_dict(a) for a in agents]


@router.post("")
async def create_agent(req: AgentCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    from app.core.config import settings
    agent = Agent(
        user_id=current_user.id,
        model_id=req.model_id or settings.BEDROCK_MODEL_ID,
        **{k: v for k, v in req.model_dump().items() if k != "model_id"},
    )
    db.add(agent)
    db.flush()
    snapshot = req.model_dump()
    version = AgentVersion(agent_id=agent.id, version_number=1, snapshot=snapshot, change_description="Initial version")
    db.add(version)
    db.commit()
    db.refresh(agent)
    return _agent_dict(agent)


@router.get("/{agent_id}")
async def get_agent(agent_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    agent = db.query(Agent).filter(Agent.id == agent_id, Agent.user_id == current_user.id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return _agent_dict(agent)


@router.put("/{agent_id}")
async def update_agent(agent_id: int, req: AgentUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    agent = db.query(Agent).filter(Agent.id == agent_id, Agent.user_id == current_user.id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    for field, value in req.model_dump(exclude_none=True).items():
        setattr(agent, field, value)
    agent.current_version += 1
    snapshot = {c.name: getattr(agent, c.name) for c in agent.__table__.columns}
    snapshot = {k: (str(v) if not isinstance(v, (str, int, float, bool, type(None))) else v) for k, v in snapshot.items()}
    version = AgentVersion(agent_id=agent.id, version_number=agent.current_version, snapshot=snapshot, change_description="Configuration updated")
    db.add(version)
    db.commit()
    db.refresh(agent)
    return _agent_dict(agent)


@router.delete("/{agent_id}")
async def delete_agent(agent_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    agent = db.query(Agent).filter(Agent.id == agent_id, Agent.user_id == current_user.id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    db.delete(agent)
    db.commit()
    return {"status": "deleted"}


@router.get("/{agent_id}/versions")
async def get_versions(agent_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    agent = db.query(Agent).filter(Agent.id == agent_id, Agent.user_id == current_user.id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return [{"id": v.id, "version_number": v.version_number, "change_description": v.change_description,
             "reliability_score": v.reliability_score, "security_score": v.security_score, "created_at": v.created_at}
            for v in agent.versions]


@router.post("/{agent_id}/chat")
async def agent_chat(agent_id: int, req: AgentChatRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    Send a message to a specific agent and get a real LLM response with tool execution.
    Uses the agent's configured model, system prompt, and tools.
    """
    import json, boto3
    from app.core.config import settings

    agent = db.query(Agent).filter(Agent.id == agent_id, Agent.user_id == current_user.id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    # Build Bedrock tools from agent's configured tools
    bedrock_tools = []
    for t in agent.tools:
        schema = t.input_schema or {"type": "object", "properties": {}}
        bedrock_tools.append({"name": t.name, "description": t.description or t.name, "input_schema": schema})

    model_id = agent.model_id if (agent.model_id and agent.model_id != "demo-mode") else settings.BEDROCK_MODEL_ID

    client = boto3.client(
        "bedrock-runtime",
        region_name=settings.AWS_DEFAULT_REGION or "us-east-1",
        aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
        aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
        aws_session_token=settings.AWS_SESSION_TOKEN,
    )

    messages = [{"role": m.role, "content": m.content} for m in req.messages]
    tool_calls_made = []
    final_response = ""

    body = {
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": agent.max_tokens or 1024,
        "messages": messages,
    }
    if agent.system_prompt:
        body["system"] = agent.system_prompt
    if bedrock_tools:
        body["tools"] = bedrock_tools

    for _ in range(8):
        try:
            response = client.invoke_model(modelId=model_id, body=json.dumps(body))
            result = json.loads(response["body"].read())
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"LLM error: {str(e)}")

        content = result.get("content", [])
        stop_reason = result.get("stop_reason")
        messages.append({"role": "assistant", "content": content})

        for block in content:
            if isinstance(block, dict) and block.get("type") == "text":
                final_response = block["text"]

        if stop_reason == "end_turn":
            break

        if stop_reason == "tool_use":
            tool_results = []
            for block in content:
                if isinstance(block, dict) and block.get("type") == "tool_use":
                    tool_name = block["name"]
                    tool_input = block.get("input", {})

                    # Execute tool from agent's tool config (sandbox mock)
                    tool_result = _execute_agent_tool(agent, tool_name, tool_input)
                    tool_calls_made.append({"name": tool_name, "args": tool_input, "result": tool_result})
                    tool_results.append({"type": "tool_result", "tool_use_id": block["id"], "content": json.dumps(tool_result)})

            messages.append({"role": "user", "content": tool_results})
            body["messages"] = messages

    return {"response": final_response, "tool_calls": tool_calls_made, "agent_id": agent_id}


def _execute_agent_tool(agent: Agent, tool_name: str, tool_input: dict) -> dict:
    """Execute a tool in sandbox mode using the configured mock_response."""
    import json
    for t in agent.tools:
        if t.name == tool_name:
            if t.execution_mode == "MOCK" and t.mock_response:
                try:
                    return json.loads(t.mock_response)
                except Exception:
                    return {"result": t.mock_response}
            return {"result": "tool executed", "tool": tool_name, "sandbox": True}
    return {"error": f"Tool '{tool_name}' not found on this agent"}
