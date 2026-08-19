from sqlalchemy import Column, Integer, String, Text, Float, Boolean, DateTime, ForeignKey, JSON, func
from sqlalchemy.orm import relationship
from app.core.database import Base


class TestRun(Base):
    __tablename__ = "test_runs"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    agent_id = Column(Integer, ForeignKey("agents.id"), nullable=False, index=True)
    agent_version_id = Column(Integer, ForeignKey("agent_versions.id"))
    name = Column(String)
    status = Column(String, default="queued")
    total_scenarios = Column(Integer, default=0)
    passed = Column(Integer, default=0)
    failed = Column(Integer, default=0)
    errors = Column(Integer, default=0)
    reliability_score = Column(Float)
    security_score = Column(Float)
    critical_findings = Column(Integer, default=0)
    high_findings = Column(Integer, default=0)
    medium_findings = Column(Integer, default=0)
    low_findings = Column(Integer, default=0)
    total_tokens = Column(Integer, default=0)
    estimated_cost = Column(Float)
    started_at = Column(DateTime(timezone=True))
    completed_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    agent = relationship("Agent", back_populates="test_runs")
    agent_version = relationship("AgentVersion", back_populates="test_runs")
    results = relationship("TestResult", back_populates="test_run", cascade="all, delete-orphan")
    findings = relationship("Finding", back_populates="test_run", cascade="all, delete-orphan")
    reports = relationship("Report", back_populates="test_run")


class TestResult(Base):
    __tablename__ = "test_results"
    id = Column(Integer, primary_key=True, index=True)
    test_run_id = Column(Integer, ForeignKey("test_runs.id"), nullable=False, index=True)
    scenario_id = Column(Integer, ForeignKey("scenarios.id"), nullable=False)
    status = Column(String, default="queued")
    pass_count = Column(Integer, default=0)
    fail_count = Column(Integer, default=0)
    error_message = Column(Text)
    latency_ms = Column(Integer)
    token_usage = Column(JSON)
    estimated_cost = Column(Float)
    started_at = Column(DateTime(timezone=True))
    completed_at = Column(DateTime(timezone=True))
    test_run = relationship("TestRun", back_populates="results")
    scenario = relationship("Scenario", back_populates="test_results")
    execution_events = relationship("ExecutionEvent", back_populates="test_result", cascade="all, delete-orphan", order_by="ExecutionEvent.sequence")
    findings = relationship("Finding", back_populates="test_result")


class ExecutionEvent(Base):
    __tablename__ = "execution_events"
    id = Column(Integer, primary_key=True, index=True)
    test_result_id = Column(Integer, ForeignKey("test_results.id"), nullable=False, index=True)
    sequence = Column(Integer, nullable=False)
    event_type = Column(String, nullable=False)
    actor = Column(String)
    content = Column(Text)
    extra_metadata = Column(JSON)
    tool_name = Column(String)
    tool_args = Column(JSON)
    tool_result = Column(Text)
    is_blocked = Column(Boolean, default=False)
    latency_ms = Column(Integer)
    token_usage = Column(JSON)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    test_result = relationship("TestResult", back_populates="execution_events")
