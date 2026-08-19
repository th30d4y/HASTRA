from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey, JSON, func, Table
from sqlalchemy.orm import relationship
from app.core.database import Base

agent_tools = Table(
    "agent_tools", Base.metadata,
    Column("agent_id", Integer, ForeignKey("agents.id"), primary_key=True),
    Column("tool_id", Integer, ForeignKey("tools.id"), primary_key=True),
)


class Tool(Base):
    __tablename__ = "tools"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    description = Column(Text)
    input_schema = Column(JSON)
    output_schema = Column(JSON)
    permission_level = Column(String, default="user")
    risk_level = Column(String, default="SAFE")
    mock_response = Column(Text)
    real_endpoint = Column(String)
    execution_mode = Column(String, default="MOCK")
    requires_confirmation = Column(Boolean, default=False)
    requires_role = Column(String)
    is_demo = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    agents = relationship("Agent", secondary="agent_tools", back_populates="tools")
