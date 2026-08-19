from sqlalchemy import Column, Integer, String, Text, Float, Boolean, DateTime, ForeignKey, JSON, func
from sqlalchemy.orm import relationship
from app.core.database import Base


class Agent(Base):
    __tablename__ = "agents"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    description = Column(Text)
    system_prompt = Column(Text)
    provider_id = Column(Integer, ForeignKey("providers.id"))
    api_key_id = Column(Integer, ForeignKey("api_keys.id"))
    model_id = Column(String)
    temperature = Column(Float, default=0.7)
    max_tokens = Column(Integer, default=2048)
    endpoint = Column(String)
    environment = Column(String, default="sandbox")
    is_demo = Column(Boolean, default=False)
    current_version = Column(Integer, default=1)
    reliability_score = Column(Float)
    security_score = Column(Float)
    last_tested_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    user = relationship("User", back_populates="agents")
    provider = relationship("Provider")
    api_key = relationship("ApiKey")
    versions = relationship("AgentVersion", back_populates="agent", cascade="all, delete-orphan")
    tools = relationship("Tool", secondary="agent_tools", back_populates="agents")
    mcp_servers = relationship("McpServer", secondary="agent_mcp_servers", back_populates="agents")
    recordings = relationship("Recording", back_populates="agent", cascade="all, delete-orphan")
    test_runs = relationship("TestRun", back_populates="agent", cascade="all, delete-orphan")


class AgentVersion(Base):
    __tablename__ = "agent_versions"
    id = Column(Integer, primary_key=True, index=True)
    agent_id = Column(Integer, ForeignKey("agents.id"), nullable=False, index=True)
    version_number = Column(Integer, nullable=False)
    snapshot = Column(JSON, nullable=False)
    change_description = Column(Text)
    reliability_score = Column(Float)
    security_score = Column(Float)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    agent = relationship("Agent", back_populates="versions")
    test_runs = relationship("TestRun", back_populates="agent_version")
