from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey, JSON, func, Table
from sqlalchemy.orm import relationship
from app.core.database import Base

agent_mcp_servers = Table(
    "agent_mcp_servers", Base.metadata,
    Column("agent_id", Integer, ForeignKey("agents.id"), primary_key=True),
    Column("mcp_server_id", Integer, ForeignKey("mcp_servers.id"), primary_key=True),
)


class McpServer(Base):
    __tablename__ = "mcp_servers"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    description = Column(Text)
    transport = Column(String, default="stdio")
    endpoint = Column(String)
    auth_type = Column(String)
    auth_config = Column(Text)
    allowed_domains = Column(JSON)
    blocked_domains = Column(JSON)
    max_actions = Column(Integer, default=50)
    timeout_seconds = Column(Integer, default=30)
    headless = Column(Boolean, default=True)
    is_connected = Column(Boolean, default=False)
    available_tools = Column(JSON)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    agents = relationship("Agent", secondary="agent_mcp_servers", back_populates="mcp_servers")
