import uuid
from typing import Optional, List, Dict, Any
from pydantic import BaseModel
from fastapi import HTTPException
from rq import Queue
from redis import Redis

from core.ports import IUnitOfWork, IWikiMemoryPort
from db_models import SkillRequest, User
from config import REDIS_URI, CLERK_SECRET_KEY, DATABASE_URL
from worker import process_skill_request

# --- Command & Query Infrastructure ---

class Command(BaseModel):
    pass

class Query(BaseModel):
    pass

# --- Command Definitions ---

class GenerateSkillCommand(Command):
    urls: list[str]
    prompt: str
    include_mcp: bool
    user_id: str

class StoreWikiDocumentCommand(Command):
    doc_id: str
    title: str
    content: str

class UpsertClerkUserCommand(Command):
    user_id: str
    email: str
    first_name: Optional[str]
    last_name: Optional[str]

class DeleteClerkUserCommand(Command):
    user_id: str


# --- Query Definitions ---

class GetSkillRequestQuery(Query):
    db_id: int
    user_id: str

class SearchWikiQuery(Query):
    query: str
    doc_id: Optional[str] = None
    limit: int = 5


# --- Command Handlers ---

class GenerateSkillHandler:
    def __init__(self, uow: IUnitOfWork):
        self.uow = uow
        self.redis_conn = Redis.from_url(REDIS_URI)
        self.q = Queue(connection=self.redis_conn)

    def handle(self, command: GenerateSkillCommand) -> Dict[str, Any]:
        thread_id = str(uuid.uuid4())
        primary_url = command.urls[0] if command.urls else ""
        
        with self.uow as uow:
            req = SkillRequest(
                thread_id=thread_id,
                user_id=command.user_id,
                url=primary_url,
                prompt=command.prompt,
                include_mcp=command.include_mcp,
                status="pending"
            )
            uow.skills.add(req)
            uow.commit()
            db_id = req.id

        # Queue the job using the RQ worker — pass all urls
        job = self.q.enqueue(
            process_skill_request, 
            db_id, 
            thread_id, 
            command.user_id, 
            command.urls, 
            command.prompt, 
            command.include_mcp, 
            job_timeout='10m'
        )

        return {
            "status": "enqueued", 
            "job_id": job.id, 
            "thread_id": thread_id, 
            "db_id": db_id,
            "urls": command.urls,
        }


class StoreWikiDocumentHandler:
    def __init__(self, wiki_port: IWikiMemoryPort):
        self.wiki_port = wiki_port

    def handle(self, command: StoreWikiDocumentCommand) -> Dict[str, Any]:
        num_chunks = self.wiki_port.store(
            doc_id=command.doc_id,
            title=command.title,
            content=command.content
        )
        return {"success": True, "chunks_stored": num_chunks}


class UpsertClerkUserHandler:
    def __init__(self, uow: IUnitOfWork):
        self.uow = uow

    def handle(self, command: UpsertClerkUserCommand) -> None:
        with self.uow as uow:
            uow.users.upsert(
                user_id=command.user_id,
                email=command.email,
                first_name=command.first_name,
                last_name=command.last_name
            )
            uow.commit()

        # Replicate to Neon postgres
        self._neon_upsert_user(command)

    def _neon_upsert_user(self, command: UpsertClerkUserCommand):
        try:
            import psycopg2
            conn = psycopg2.connect(DATABASE_URL)
            with conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        INSERT INTO users (id, email, first_name, last_name)
                        VALUES (%s, %s, %s, %s)
                        ON CONFLICT (id) DO UPDATE
                          SET email      = EXCLUDED.email,
                              first_name = EXCLUDED.first_name,
                              last_name  = EXCLUDED.last_name
                        """,
                        (command.user_id, command.email, command.first_name, command.last_name),
                    )
            conn.close()
        except Exception as exc:
            print(f"[clerk_webhook] Neon sync failed: {exc}")


class DeleteClerkUserHandler:
    def __init__(self, uow: IUnitOfWork):
        self.uow = uow

    def handle(self, command: DeleteClerkUserCommand) -> None:
        with self.uow as uow:
            uow.users.delete(command.user_id)
            uow.commit()

        self._neon_delete_user(command.user_id)

    def _neon_delete_user(self, user_id: str):
        try:
            import psycopg2
            conn = psycopg2.connect(DATABASE_URL)
            with conn:
                with conn.cursor() as cur:
                    cur.execute("DELETE FROM users WHERE id = %s", (user_id,))
            conn.close()
        except Exception as exc:
            print(f"[clerk_webhook] Neon sync delete failed: {exc}")


# --- Query Handlers ---

class GetSkillRequestHandler:
    def __init__(self, uow: IUnitOfWork):
        self.uow = uow

    def handle(self, query: GetSkillRequestQuery) -> Dict[str, Any]:
        with self.uow as uow:
            req = uow.skills.get(query.db_id)
            if not req:
                raise HTTPException(status_code=404, detail="Not found")
            if req.user_id != query.user_id:
                raise HTTPException(status_code=403, detail="Forbidden")

            return {
                "status": req.status,
                "error": req.error,
                "trace_url": req.trace_url,
                "url": req.url,
                "createdSkill": {
                    "folderName": f"skill-{req.id}",
                    "displayName": "Generated Skill",
                    "description": "Custom skill created via AI",
                    "files": {
                        "SKILL.md": req.skill_content,
                        "mcp_server.py": req.mcp_script if req.mcp_script else None,
                        "mcp_config.json": req.mcp_config if req.mcp_config else None
                    }
                } if req.status == "completed" else None
            }


class SearchWikiHandler:
    def __init__(self, wiki_port: IWikiMemoryPort):
        self.wiki_port = wiki_port

    def handle(self, query: SearchWikiQuery) -> Dict[str, Any]:
        results = self.wiki_port.search(
            query=query.query,
            doc_id=query.doc_id,
            limit=query.limit
        )
        return {"results": results}
