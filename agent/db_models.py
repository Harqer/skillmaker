from datetime import datetime, timezone

from sqlmodel import Field, SQLModel


class User(SQLModel, table=True):
    id: str = Field(primary_key=True)
    email: str = Field(index=True)
    first_name: str | None = None
    last_name: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class SkillRequest(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    thread_id: str = Field(index=True, unique=True)
    user_id: str = Field(index=True)
    url: str
    prompt: str
    include_mcp: bool = False
    status: str = Field(default="pending")  # pending, processing, completed, failed
    skill_content: str | None = None
    mcp_script: str | None = None
    mcp_config: str | None = None
    trace_url: str | None = None
    error: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
