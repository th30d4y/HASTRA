from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey, JSON, func
from sqlalchemy.orm import relationship
from app.core.database import Base


class Scenario(Base):
    __tablename__ = "scenarios"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    agent_id = Column(Integer, ForeignKey("agents.id"), index=True)
    source_recording_id = Column(Integer, ForeignKey("recordings.id"))
    name = Column(String, nullable=False)
    description = Column(Text)
    category = Column(String, default="normal")
    risk_level = Column(String, default="LOW")
    user_input = Column(Text)
    expected_behavior = Column(Text)
    preconditions = Column(JSON)
    agent_instructions = Column(Text)
    tool_constraints = Column(JSON)
    is_generated = Column(Boolean, default=False)
    is_demo = Column(Boolean, default=False)
    generation_model = Column(String)
    tags = Column(JSON)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    source_recording = relationship("Recording", back_populates="scenarios")
    steps = relationship("ScenarioStep", back_populates="scenario", cascade="all, delete-orphan", order_by="ScenarioStep.order_index")
    assertions = relationship("ScenarioAssertion", back_populates="scenario", cascade="all, delete-orphan")
    test_results = relationship("TestResult", back_populates="scenario")


class ScenarioStep(Base):
    __tablename__ = "scenario_steps"
    id = Column(Integer, primary_key=True, index=True)
    scenario_id = Column(Integer, ForeignKey("scenarios.id"), nullable=False, index=True)
    order_index = Column(Integer, nullable=False)
    step_type = Column(String, nullable=False)
    content = Column(Text)
    extra_metadata = Column(JSON)
    scenario = relationship("Scenario", back_populates="steps")


class ScenarioAssertion(Base):
    __tablename__ = "scenario_assertions"
    id = Column(Integer, primary_key=True, index=True)
    scenario_id = Column(Integer, ForeignKey("scenarios.id"), nullable=False, index=True)
    assertion_type = Column(String, nullable=False)
    description = Column(Text)
    config = Column(JSON)
    is_required = Column(Boolean, default=True)
    scenario = relationship("Scenario", back_populates="assertions")
