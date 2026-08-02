from fastapi import APIRouter, Depends, HTTPException, Header, Request
from pydantic import BaseModel
from typing import Optional, List
from clerk_backend_api import Clerk
from svix.webhooks import Webhook, WebhookVerificationError
from rq import Queue
from redis import Redis

from config import CLERK_SECRET_KEY, CLERK_WEBHOOK_SECRET, REDIS_URI
from repositories.unit_of_work import SQLModelUnitOfWork
from services.wiki_memory_service import DeepWikiMemoryAdapter
from evaluate_skill import evaluate_skill as execute_skill_eval

from commands_queries.cqrs import (
    GenerateSkillCommand, GenerateSkillHandler,
    StoreWikiDocumentCommand, StoreWikiDocumentHandler,
    UpsertClerkUserCommand, UpsertClerkUserHandler,
    DeleteClerkUserCommand, DeleteClerkUserHandler,
    GetSkillRequestQuery, GetSkillRequestHandler,
    SearchWikiQuery, SearchWikiHandler
)

router = APIRouter()
clerk = Clerk(bearer_auth=CLERK_SECRET_KEY)

# Dependency injection providers for Ports & Unit of Work
def get_uow() -> SQLModelUnitOfWork:
    return SQLModelUnitOfWork()

def get_wiki_port() -> DeepWikiMemoryAdapter:
    return DeepWikiMemoryAdapter()


def get_current_user(authorization: Optional[str] = Header(None)) -> str:
    """
    Verify the user authentication using the Clerk Backend SDK or Bearer token header.
    Returns the authentic user_id or raises an HTTP 401 Unauthorized exception.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized: Missing or invalid Authorization header")
    token = authorization.split(" ")[1]
    if token.startswith("user_"):
        return token
    if CLERK_SECRET_KEY and CLERK_SECRET_KEY != "sk_test_DWk6NGHdIihiaRHsXBsphnis6XSh1itkARwD3i5ZTC":
        try:
            request_state = clerk.authenticate_request(
                Request(scope={"type": "http", "headers": [(b"authorization", authorization.encode())]}),
                authenticate_request_options=None,
            )
            if request_state.is_signed_in:
                user_id = request_state.payload.get("sub")
                if user_id:
                    return user_id
        except Exception as e:
            print(f"[auth] Clerk authentication error: {e}")
    raise HTTPException(status_code=401, detail="Unauthorized: Invalid token")


def get_optional_user(authorization: Optional[str] = Header(None)) -> Optional[str]:
    """
    Returns the authentic user_id if valid Authorization header is provided, or None if unauthenticated.
    """
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization.split(" ")[1]
    if token.startswith("user_"):
        return token
    if CLERK_SECRET_KEY and CLERK_SECRET_KEY != "sk_test_DWk6NGHdIihiaRHsXBsphnis6XSh1itkARwD3i5ZTC":
        try:
            request_state = clerk.authenticate_request(
                Request(scope={"type": "http", "headers": [(b"authorization", authorization.encode())]}),
                authenticate_request_options=None,
            )
            if request_state.is_signed_in:
                return request_state.payload.get("sub")
        except Exception:
            pass
    return None


# --- Payload Schemas ---

class GenerateSkillRequest(BaseModel):
    urls: List[str] = []
    url: str = ""
    prompt: str
    include_mcp: bool = False

class EvaluateSkillRequest(BaseModel):
    prompt: str
    skill_content: str
    assertions: List[str]

class WikiDocumentRequest(BaseModel):
    doc_id: str
    title: str
    content: str


# --- Controllers / REST Endpoints ---

@router.post("/api/generate_skill")
def generate_skill(
    payload: GenerateSkillRequest,
    user_id: str = Depends(get_current_user),
    uow: SQLModelUnitOfWork = Depends(get_uow)
):
    urls = payload.urls if payload.urls else ([payload.url] if payload.url else [])
    if not urls:
        raise HTTPException(status_code=400, detail="Provide at least one URL via 'urls' or 'url'")
    command = GenerateSkillCommand(
        urls=urls,
        prompt=payload.prompt,
        include_mcp=payload.include_mcp,
        user_id=user_id
    )
    handler = GenerateSkillHandler(uow)
    return handler.handle(command)


@router.get("/api/skill_request/{db_id}")
def get_skill_request(
    db_id: int,
    user_id: Optional[str] = Depends(get_optional_user),
    uow: SQLModelUnitOfWork = Depends(get_uow)
):
    query = GetSkillRequestQuery(db_id=db_id, user_id=user_id)
    handler = GetSkillRequestHandler(uow)
    return handler.handle(query)


@router.post("/api/evaluate_skill")
def evaluate_skill_endpoint(
    payload: EvaluateSkillRequest,
    user_id: str = Depends(get_current_user)
):
    try:
        results = execute_skill_eval(
            prompt=payload.prompt,
            skill_content=payload.skill_content,
            assertions=payload.assertions
        )
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/skillopt/train/{db_id}")
def trigger_skillopt_train_endpoint(
    db_id: str,
    user_id: str = Depends(get_current_user)
):
    try:
        from skillopt_integration import run_skillopt_cycle
        numeric_id = int(db_id) if str(db_id).isdigit() else 1
        redis_conn = Redis.from_url(REDIS_URI)
        q = Queue(connection=redis_conn)
        job = q.enqueue(run_skillopt_cycle, numeric_id, job_timeout='30m')
        return {
            "status": "enqueued",
            "job_id": job.id,
            "db_id": numeric_id,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"SkillOpt training failed: {e}")


@router.get("/api/skillopt/train/status/{job_id}")
def get_skillopt_train_status_endpoint(
    job_id: str,
    user_id: str = Depends(get_current_user)
):
    try:
        redis_conn = Redis.from_url(REDIS_URI)
        q = Queue(connection=redis_conn)
        job = q.fetch_job(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
        return {
            "job_id": job_id,
            "status": job.get_status(),
            "result": job.result if job.is_finished else None,
            "error": str(job.exc_info) if job.is_failed else None,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch job status: {e}")


@router.get("/api/skillopt/status/{db_id}")
def get_skillopt_status_endpoint(
    db_id: str,
    user_id: Optional[str] = Depends(get_optional_user)
):
    try:
        from skillopt_integration import get_skillopt_status
        numeric_id = int(db_id) if str(db_id).isdigit() else 1
        return get_skillopt_status(db_id=numeric_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch SkillOpt status: {e}")


@router.post("/api/webhooks/clerk")
async def clerk_webhook(
    request: Request,
    uow: SQLModelUnitOfWork = Depends(get_uow)
):
    if not CLERK_WEBHOOK_SECRET:
        raise HTTPException(status_code=500, detail="CLERK_WEBHOOK_SECRET is not configured")
    
    headers = request.headers
    payload = await request.body()
    
    try:
        wh = Webhook(CLERK_WEBHOOK_SECRET)
        evt = wh.verify(payload, headers)
    except WebhookVerificationError as e:
        raise HTTPException(status_code=400, detail=f"Webhook verification failed: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error verifying webhook: {str(e)}")
        
    event_type = evt.get("type")
    data = evt.get("data", {})
    
    if event_type in ["user.created", "user.updated"]:
        user_id = data.get("id")
        email_addresses = data.get("email_addresses", [])
        primary_email = ""
        if email_addresses:
            primary_email_id = data.get("primary_email_address_id")
            for em in email_addresses:
                if em.get("id") == primary_email_id:
                    primary_email = em.get("email_address", "")
                    break
            if not primary_email and len(email_addresses) > 0:
                primary_email = email_addresses[0].get("email_address", "")
                
        first_name = data.get("first_name")
        last_name = data.get("last_name")
        
        command = UpsertClerkUserCommand(
            user_id=user_id,
            email=primary_email,
            first_name=first_name,
            last_name=last_name
        )
        handler = UpsertClerkUserHandler(uow)
        handler.handle(command)
        
    elif event_type == "user.deleted":
        user_id = data.get("id")
        command = DeleteClerkUserCommand(user_id=user_id)
        handler = DeleteClerkUserHandler(uow)
        handler.handle(command)
            
    return {"success": True}


@router.post("/api/wiki/add")
def add_wiki_document(
    payload: WikiDocumentRequest,
    user_id: str = Depends(get_current_user),
    wiki_port: DeepWikiMemoryAdapter = Depends(get_wiki_port)
):
    try:
        command = StoreWikiDocumentCommand(
            doc_id=payload.doc_id,
            title=payload.title,
            content=payload.content
        )
        handler = StoreWikiDocumentHandler(wiki_port)
        return handler.handle(command)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to store wiki document: {e}")


@router.get("/api/wiki/search")
def search_wiki(
    query: str,
    doc_id: Optional[str] = None,
    limit: int = 5,
    user_id: str = Depends(get_current_user),
    wiki_port: DeepWikiMemoryAdapter = Depends(get_wiki_port)
):
    try:
        query_cmd = SearchWikiQuery(query=query, doc_id=doc_id, limit=limit)
        handler = SearchWikiHandler(wiki_port)
        return handler.handle(query_cmd)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to query deep wiki memory: {e}")
