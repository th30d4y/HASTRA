from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey, func
from sqlalchemy.orm import relationship
from app.core.database import Base


class Provider(Base):
    __tablename__ = "providers"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)
    display_name = Column(String, nullable=False)
    provider_type = Column(String, nullable=False)
    is_active = Column(Boolean, default=True)
    supports_streaming = Column(Boolean, default=True)
    config_schema = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    api_keys = relationship("ApiKey", back_populates="provider")


class ApiKey(Base):
    __tablename__ = "api_keys"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    provider_id = Column(Integer, ForeignKey("providers.id"), nullable=False)
    name = Column(String, nullable=False)
    encrypted_key = Column(Text, nullable=False)
    key_hint = Column(String)
    is_default = Column(Boolean, default=False)
    is_valid = Column(Boolean)
    extra_config = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    user = relationship("User", back_populates="api_keys")
    provider = relationship("Provider", back_populates="api_keys")
