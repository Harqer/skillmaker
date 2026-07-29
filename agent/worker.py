import os
import sys
from sqlmodel import Session

# Ensure the agent directory is on the path and secrets are loaded from Infisical env
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import config  # noqa — sets LANGCHAIN_TRACING_V2, GOOGLE_API_KEY, etc.

from db import engine
from db_models import SkillRequest
from orchestrator import run_orchestrator as run_agent

def process_skill_request(db_id: int, thread_id: str, user_id: str, urls: str | list[str], prompt: str, include_mcp: bool):
    """
    RQ worker function.
    Accepts one or more URLs, bulk-scrapes all of them, stores every markdown
    in Databricks vector embeddings, then runs the LangGraph orchestrator
    on the first URL for LLM skill generation.
    """
    if isinstance(urls, str):
        urls = [urls]

    try:
        # Mark as processing
        with Session(engine) as session:
            req = session.get(SkillRequest, db_id)
            if not req:
                print(f"Error: DB Request {db_id} not found.")
                return
            req.status = "processing"
            session.add(req)
            session.commit()

        # Run the LangGraph orchestrator with ALL urls for bulk scrape.
        result = run_agent(urls, prompt, include_mcp=include_mcp, thread_id=thread_id, user_id=user_id, db_id=db_id)
        
        # Mark as completed
        with Session(engine) as session:
            req = session.get(SkillRequest, db_id)
            if req:
                req.status = "completed"
                req.skill_content = result.get("skill_content")
                req.mcp_script = result.get("mcp_script")
                req.mcp_config = result.get("mcp_config")
                req.trace_url = result.get("trace_url")
                session.add(req)
                session.commit()
                print(f"Successfully processed request {db_id} ({len(urls)} URLs scraped)")
                
                # Register skill in SkillOpt for evaluation and refinement.
                # Pass the scraped markdown so SkillOpt can build real training
                # items from the documentation instead of dummy answers.
                from skillopt_integration import register_skill_for_skillopt
                register_skill_for_skillopt(
                    db_id=db_id,
                    skill_content=req.skill_content,
                    prompt=prompt,
                    target_url=urls[0],
                    scraped_markdown=result.get("scraped_text", ""),
                )

    except Exception as e:
        import traceback
        traceback.print_exc()
        # Mark as failed
        with Session(engine) as session:
            req = session.get(SkillRequest, db_id)
            if req:
                req.status = "failed"
                req.error = str(e)
                session.add(req)
                session.commit()
                print(f"Failed processing request {db_id}")
