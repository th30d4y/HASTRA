from sqlalchemy import Column, Integer, String, Text, Float, Boolean, DateTime, ForeignKey, JSON, func
from sqlalchemy.orm import relationship
from app.core.database import Base


class FailureCategory(Base):
    __tablename__ = "failure_categories"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)
    display_name = Column(String, nullable=False)
    category_type = Column(String, nullable=False)
    description = Column(Text)
    severity_default = Column(String, default="MEDIUM")
    findings = relationship("Finding", back_populates="failure_category")


class Finding(Base):
    __tablename__ = "findings"
    id = Column(Integer, primary_key=True, index=True)
    test_run_id = Column(Integer, ForeignKey("test_runs.id"), nullable=False, index=True)
    test_result_id = Column(Integer, ForeignKey("test_results.id"), index=True)
    failure_category_id = Column(Integer, ForeignKey("failure_categories.id"))
    title = Column(String, nullable=False)
    description = Column(Text)
    severity = Column(String, nullable=False, default="MEDIUM")
    confidence = Column(Float, default=0.8)
    evidence = Column(Text)
    expected_behavior = Column(Text)
    actual_behavior = Column(Text)
    recommended_fix = Column(Text)
    trace_event_ref = Column(JSON)
    is_regression = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    test_run = relationship("TestRun", back_populates="findings")
    test_result = relationship("TestResult", back_populates="findings")
    failure_category = relationship("FailureCategory", back_populates="findings")
