from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, Float, ForeignKey, JSON, func
from sqlalchemy.orm import relationship
from app.core.database import Base


class Recording(Base):
    __tablename__ = "recordings"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    agent_id = Column(Integer, ForeignKey("agents.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    description = Column(Text)
    tags = Column(JSON)
    duration_ms = Column(Integer)
    event_count = Column(Integer, default=0)
    agent_version = Column(Integer)
    model_id = Column(String)
    status = Column(String, default="ready")
    extra_metadata = Column(JSON)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True))
    agent = relationship("Agent", back_populates="recordings")
    events = relationship("RecordingEvent", back_populates="recording", cascade="all, delete-orphan", order_by="RecordingEvent.timestamp_ms")
    scenarios = relationship("Scenario", back_populates="source_recording")


class RecordingEvent(Base):
    __tablename__ = "recording_events"
    id = Column(Integer, primary_key=True, index=True)
    recording_id = Column(Integer, ForeignKey("recordings.id"), nullable=False, index=True)
    event_type = Column(String, nullable=False)
    timestamp_ms = Column(Integer, nullable=False)
    actor = Column(String)
    content = Column(Text)
    extra_metadata = Column(JSON)
    tool_name = Column(String)
    tool_args = Column(JSON)
    tool_result = Column(Text)
    screenshot_base64 = Column(Text)
    token_usage = Column(JSON)
    latency_ms = Column(Integer)
    recording = relationship("Recording", back_populates="events")
