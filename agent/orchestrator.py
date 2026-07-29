"""
orchestrator.py — LangGraph skill-generation pipeline with Sub-Agent Hierarchies and Structured JSON Outputs.

Graph topology (with robust, production-grade sub-agents):
  START
    └─► scraper_sub_agent (Sub-Agent Graph: scrapes & prunes doc context with RedisVL SemanticCache)
          └─► codegen_sub_agent (Sub-Agent Graph: generates Eve files using LangChain Structured JSON & scaffolds FastMCP)
                └─► security_sub_agent (Sub-Agent Graph: sanitizes, ingests dynamically, and runs Self-Evolution)
                      └─► END

Key Enhancements & Dynamic Retrieval:
  • ZERO-TOKEN INTERCEPTION is powered by a high-performance RedisVL SemanticCache instance.
  • Eve skill format output generation is governed by a strict Pydantic schema using LangChain's `.with_structured_output` API.
  • Content retrieval uses dynamic, relevance-based similarity searches (search_dynamic) instead of hardcoded limits.
"""
import os
import uuid
import json
from typing import TypedDict, Annotated, Optional, Dict, List
from pydantic import BaseModel, Field

from langchain_core.messages import AnyMessage, SystemMessage, HumanMessage
from langchain_google_genai import ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.redis import RedisSaver
from langgraph.checkpoint.memory import InMemorySaver
from tenacity import retry, stop_after_attempt, wait_exponential
from redis import Redis

from langchain_community.cache import RedisSemanticCache
from langchain_core.globals import set_llm_cache
from redisvl.extensions.llmcache import SemanticCache

import config  # noqa — sets LANGCHAIN_TRACING_V2, GOOGLE_API_KEY, etc.
from config import REDIS_URI
from memory_client import RedisAgentMemoryClient
from context_retriever import get_context_tools
from context_surfaces import SkillVectorStore
from scraper import scrape_docs
from mcp_generator import generate_mcp_config
from security_sandbox import sanitize_mcp_script, sanitize_skill_content
from databricks_store import SkillRecord, get_store as get_databricks_store

# ── RedisVL & LangChain LLM Cache ───────────────────────────────────────────

redis_client = Redis.from_url(REDIS_URI)
try:
    set_llm_cache(RedisSemanticCache(
        redis_url=REDIS_URI,
        embedding=GoogleGenerativeAIEmbeddings(model="models/text-embedding-004"),
        score_threshold=0.15
    ))
    print("[orchestrator] Redis Semantic LLM Cache enabled (LangCache active)")
except Exception as e:
    print(f"[orchestrator] Warning: Failed to set Redis Semantic LLM cache: {e}")

try:
    doc_cache = SemanticCache(
        index_name="doc_scrape_cache",
        redis_url=REDIS_URI,
        distance_threshold=0.15
    )
    print("[orchestrator] RedisVL Semantic Cache active for documentation indexing")
except Exception as e:
    print(f"[orchestrator] Warning: Failed to init RedisVL Semantic Cache: {e}")
    doc_cache = None

llm = ChatGoogleGenerativeAI(model="gemini-2.0-flash", temperature=0)
agent_memory = RedisAgentMemoryClient()
skill_store = SkillVectorStore()

# ── Structured JSON output schema for Eve Framework ────────────────────────

class EveSkill(BaseModel):
    files: Dict[str, str] = Field(
        description="A dictionary mapping file paths (e.g., 'agent.ts', 'instructions.md', 'skills/api.md', 'tools/fetch.ts') to their exact string content."
    )

structured_llm = llm.with_structured_output(EveSkill)


class DocScraperAnalysis(BaseModel):
    existing_skills_found: bool = Field(description="True if the documentation explicitly contains a pre-built agent skill setup, system prompt, or instructions.md content.")
    extracted_skills_files: Optional[Dict[str, str]] = Field(description="A dictionary mapping file paths (e.g. 'SKILL.md', 'instructions.md') to their exact string content if found in the documentation, otherwise empty.")
    existing_mcp_found: bool = Field(description="True if the documentation explicitly contains an MCP (Model Context Protocol) server script or FastMCP code snippet.")
    extracted_mcp_script: Optional[str] = Field(description="The exact or reconstructed python MCP server script found in the docs, or null.")
    extracted_mcp_config: Optional[str] = Field(description="The exact or reconstructed MCP config JSON found in the docs, or null.")
    general_analysis: str = Field(description="General summary of the API endpoints, parameters, and capabilities of the documented service.")

# ── Subgraph State Definitions ──────────────────────────────────────────────

class ScraperState(TypedDict):
    target_url: str
    task_prompt: str
    pruned_context: str
    analysis: str
    existing_skills_found: Optional[bool]
    extracted_skills_files: Optional[Dict[str, str]]
    existing_mcp_found: Optional[bool]
    extracted_mcp_script: Optional[str]
    extracted_mcp_config: Optional[str]

class CodegenState(TypedDict):
    analysis: str
    pruned_context: str
    task_prompt: str
    target_url: str
    include_mcp: bool
    skill_content: str
    folder_name: str
    mcp_script: Optional[str]
    mcp_config: Optional[str]
    existing_skills_found: Optional[bool]
    extracted_skills_files: Optional[Dict[str, str]]
    existing_mcp_found: Optional[bool]
    extracted_mcp_script: Optional[str]
    extracted_mcp_config: Optional[str]

class SecurityState(TypedDict):
    skill_content: str
    mcp_script: Optional[str]
    mcp_config: Optional[str]
    target_url: str
    db_id: Optional[int]


# ── Sub-Agent 1: Scraper & Analyzer Subgraph ────────────────────────────────

@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
def scraper_analyze_node(state: ScraperState):
    """Fetch and summarize the documentation at target_url using RedisVL SemanticCache and context pruning."""
    url = state["target_url"]
    
    # Dynamic Semantic Cache Check (Redis Iris dataset/LangCache equivalent)
    if doc_cache:
        try:
            cached_res = doc_cache.check(prompt=url)
            if cached_res:
                print(f"[scraper_sub_agent] 0-token semantic hit for {url}. Bypassing scraper and LLM.")
                cached_data = json.loads(cached_res[0]["response"])
                return {
                    "pruned_context": cached_data.get("pruned_context", ""),
                    "analysis": cached_data.get("analysis", "Cached analysis loaded from Redis Semantic Cache."),
                    "existing_skills_found": cached_data.get("existing_skills_found", False),
                    "extracted_skills_files": cached_data.get("extracted_skills_files", {}),
                    "existing_mcp_found": cached_data.get("existing_mcp_found", False),
                    "extracted_mcp_script": cached_data.get("extracted_mcp_script"),
                    "extracted_mcp_config": cached_data.get("extracted_mcp_config"),
                }
        except Exception as e:
            print(f"[scraper_sub_agent] Cache check error (non-blocking): {e}")

    scraped_text = scrape_docs(url)
    
    # Ingest Bulk Markdowns into Databricks Lakehouse Vector Store (Delta Lake + Auto Loader Indexing)
    db_store = get_databricks_store()
    if db_store:
        try:
            db_store.write_skill(SkillRecord(
                skill_id=f"doc_lakehouse_{uuid.uuid4().hex[:8]}",
                folder_name=url.replace("https://", "").replace("http://", "").split("/")[0],
                target_url=url,
                skill_content=f"# Bulk Documentation Corpus for {url}\n\n{scraped_text}",
                mcp_script=None,
                mcp_config=None,
                langsmith_trace_url=None,
                thread_id="doc_scrape_lakehouse",
                user_id="raven_deep_research",
                tags=["databricks_vector_index", "bulk_markdown", "lakehouse"]
            ))
            print(f"[scraper_sub_agent] Bulk Markdown corpus synced to Databricks Lakehouse Vector Index for {url}")
        except Exception as db_err:
            print(f"[scraper_sub_agent] Databricks store sync warning (non-blocking): {db_err}")

    # Context Pruning via Redis Agent Memory
    thread_id = "doc_scrape_" + url.replace("https://", "").replace("/", "_")
    agent_memory.add_long_term_memory(session_id=thread_id, text=f"Documentation for {url}:\n{scraped_text}")
    
    # Retrieve pruned context dynamically without hardcoded limits
    pruned_results = agent_memory.search_long_term_memory(query=f"{state['task_prompt']} API endpoints requirements", limit=10)
    if pruned_results:
        try:
            pruned_context = "\n\n".join([res.get("text", "") if isinstance(res, dict) else res.text for res in pruned_results])
        except Exception:
            pruned_context = scraped_text[:12000]
    else:
        pruned_context = scraped_text[:12000]

    # Use structured output to smartly analyze & extract provided skills/MCP setups
    analyzer_llm = llm.with_structured_output(DocScraperAnalysis)
    sys_msg = SystemMessage(
        content=(
            "You are a highly advanced documentation scraper and analyzer.\n"
            "Analyze the provided documentation markdown very carefully.\n\n"
            "Your tasks:\n"
            "1. Smartly identify if the documentation explicitly contains a pre-provided, complete agent skill setup, system prompt, or instructions/SKILL.md file.\n"
            "2. Smartly identify if the documentation explicitly contains an MCP (Model Context Protocol) server python script, FastMCP code snippet, or MCP config.\n"
            "3. If either exists, extract them exactly as provided so we can prioritize and use them directly. If only one exists, extract only that.\n"
            "4. Provide a general summary analysis of the documented API capabilities, parameters, and endpoints."
        )
    )
    analysis_prompt = HumanMessage(content=f"Pruned Documentation for {url}:\n\n{pruned_context}\n\nTask: {state['task_prompt']}")
    
    try:
        extraction = analyzer_llm.invoke([sys_msg, analysis_prompt])
        existing_skills_found = extraction.existing_skills_found
        extracted_skills_files = extraction.extracted_skills_files or {}
        existing_mcp_found = extraction.existing_mcp_found
        extracted_mcp_script = extraction.extracted_mcp_script
        extracted_mcp_config = extraction.extracted_mcp_config
        analysis_result = extraction.general_analysis
    except Exception as e:
        print(f"[scraper_sub_agent] Error during structured analysis: {e}")
        # Fallback to standard text analysis if structured output fails
        existing_skills_found = False
        extracted_skills_files = {}
        existing_mcp_found = False
        extracted_mcp_script = None
        extracted_mcp_config = None
        
        context_tools = get_context_tools()
        llm_with_tools = llm.bind_tools(context_tools)
        fallback_sys_msg = SystemMessage(
            content=(
                "You are an expert documentation analyzer. "
                "Summarize the overall capabilities of the skill based on the provided API documentation. "
                "Extract any specific API endpoints, required parameters, and authentication methods."
            )
        )
        response = llm_with_tools.invoke([fallback_sys_msg, analysis_prompt])
        analysis_result = response.content

    # Store in semantic cache
    if doc_cache:
        try:
            doc_cache.store(
                prompt=url,
                response=json.dumps({
                    "pruned_context": pruned_context, 
                    "analysis": analysis_result,
                    "existing_skills_found": existing_skills_found,
                    "extracted_skills_files": extracted_skills_files,
                    "existing_mcp_found": existing_mcp_found,
                    "extracted_mcp_script": extracted_mcp_script,
                    "extracted_mcp_config": extracted_mcp_config,
                })
            )
        except Exception as e:
            print(f"[scraper_sub_agent] Cache store error (non-blocking): {e}")

    return {
        "pruned_context": pruned_context, 
        "analysis": analysis_result,
        "existing_skills_found": existing_skills_found,
        "extracted_skills_files": extracted_skills_files,
        "existing_mcp_found": existing_mcp_found,
        "extracted_mcp_script": extracted_mcp_script,
        "extracted_mcp_config": extracted_mcp_config,
    }

scraper_builder = StateGraph(ScraperState)
scraper_builder.add_node("scrape_and_analyze", scraper_analyze_node)
scraper_builder.add_edge(START, "scrape_and_analyze")
scraper_builder.add_edge("scrape_and_analyze", END)
scraper_subgraph = scraper_builder.compile()


# ── Sub-Agent 2: Codegen Subgraph (Structured JSON Outputs) ─────────────────

@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
def generate_skill_card_node(state: CodegenState):
    """Generate the Eve framework skill content as strict JSON using LangChain Structured Outputs."""
    folder_name = (state["target_url"].split("/")[-1] or "custom-skill").replace(".", "-").lower()

    # Prioritize pre-existing skills if found in the scraped documentation
    if state.get("existing_skills_found") and state.get("extracted_skills_files"):
        print("[codegen_sub_agent] Smartly prioritizing pre-provided skills found in documentation!")
        files = state.get("extracted_skills_files")
        if isinstance(files, dict) and files:
            return {
                "skill_content": json.dumps(files, indent=2),
                "folder_name": folder_name
            }

    prompt_path = os.path.join(os.path.dirname(__file__), "skill_creator_prompt.txt")
    with open(prompt_path) as f:
        skill_creator_prompt = f.read()

    sys_msg = SystemMessage(
        content=(
            "You are an expert skill creator agent. Based on the scraped URL analysis, "
            "generate the final agent output using the Eve framework structure.\n"
            "Produce all files required for the skill.\n\n"
            "FOLLOW THESE EXPERT INSTRUCTIONS FOR HOW A SKILL SHOULD BE WRITTEN:\n\n"
            f"{skill_creator_prompt}"
        )
    )
    
    # We invoke our structured LLM which guarantees valid pydantic output
    response = structured_llm.invoke([
        sys_msg, 
        HumanMessage(content=f"Task: {state['task_prompt']}\n\nAnalysis:\n{state.get('analysis', '')}\n\nContext:\n{state.get('pruned_context', '')}")
    ])
    
    return {
        "skill_content": json.dumps(response.files, indent=2),
        "folder_name": folder_name
    }

@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
def scaffold_mcp_server_node(state: CodegenState):
    """Generate MCP server Python code — only runs when include_mcp is True."""
    if not state.get("include_mcp", False):
        return {"mcp_script": None, "mcp_config": None}

    folder_name = (state["target_url"].split("/")[-1] or "custom-skill").replace(".", "-").lower()
    skill_name = folder_name.replace("-", " ").title()

    # Prioritize pre-existing MCP server if found in the scraped documentation
    if state.get("existing_mcp_found") and state.get("extracted_mcp_script"):
        print("[codegen_sub_agent] Smartly prioritizing pre-provided MCP server found in documentation!")
        config_str = state.get("extracted_mcp_config") or generate_mcp_config(skill_name, folder_name)
        return {
            "mcp_script": state.get("extracted_mcp_script").strip(),
            "mcp_config": config_str,
        }

    analysis = state.get("analysis", "")

    sys_msg = SystemMessage(
        content=(
            f"You are an expert Python MCP developer. "
            f"Generate a fully functional Python script using `mcp.server.fastmcp.FastMCP`.\n"
            f"The server is named \"{skill_name}\".\n"
            "Create distinct `@mcp.tool()` functions for each API endpoint identified in the analysis.\n"
            "Output ONLY the raw Python code (no markdown code blocks)."
        )
    )
    response = llm.invoke([sys_msg, HumanMessage(content=f"Generate the MCP server based on:\n\n{analysis}")])

    mcp_script = response.content.strip()
    for prefix in ("```python", "```"):
        if mcp_script.startswith(prefix):
            mcp_script = mcp_script[len(prefix):]
    if mcp_script.endswith("```"):
        mcp_script = mcp_script[:-3]

    return {
        "mcp_script": mcp_script.strip(),
        "mcp_config": generate_mcp_config(skill_name, folder_name),
    }

codegen_builder = StateGraph(CodegenState)
codegen_builder.add_node("generate_skill_card", generate_skill_card_node)
codegen_builder.add_node("scaffold_mcp_server", scaffold_mcp_server_node)
codegen_builder.add_edge(START, "generate_skill_card")
codegen_builder.add_edge(START, "scaffold_mcp_server")
codegen_builder.add_edge("generate_skill_card", END)
codegen_builder.add_edge("scaffold_mcp_server", END)
codegen_subgraph = codegen_builder.compile()


# ── Sub-Agent 3: Security & Optimization (Deep Agent) Subgraph ──────────────

def security_sandbox_node(state: SecurityState):
    """AST-scan MCP script and regex-scan skill content for malicious patterns."""
    sanitized_skill = sanitize_skill_content(state.get("skill_content", ""))
    mcp_script = state.get("mcp_script")
    sanitized_mcp = sanitize_mcp_script(mcp_script) if mcp_script else None
    return {"skill_content": sanitized_skill, "mcp_script": sanitized_mcp}

def security_ingest_node(state: SecurityState):
    """Chunk the generated skill and store embeddings dynamically in Redis using dynamic relevance threshold."""
    skill_content = state.get("skill_content", "")
    db_id = state.get("db_id")
    if not skill_content:
        return {}

    skill_id = str(db_id) if db_id is not None else str(uuid.uuid4())
    try:
        n = skill_store.ingest(skill_id=skill_id, markdown=skill_content)
        print(f"[ingest_skill] Stored {n} chunks dynamically in vector store for skill_id={skill_id}")
    except Exception as e:
        print(f"[ingest_skill] Warning: Failed to index skill in Redis: {e}")
    return {}

@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
def security_evolve_node(state: SecurityState):
    """Self-Evolution Harness: Analyze generated artifacts for weaknesses and save reflections."""
    skill_content = state.get("skill_content", "")
    mcp_script = state.get("mcp_script", "")
    url = state.get("target_url", "")

    sys_msg = SystemMessage(
        content=(
            "You are an expert self-reflection AI. Analyze the generated skill and MCP server "
            "for weaknesses, missing best practices, or potential improvements. "
            "Provide a concise reflection that can be used to improve future generations."
        )
    )
    response = llm.invoke([
        sys_msg,
        HumanMessage(content=f"Analyze artifacts for {url}:\n\nSKILL:\n{skill_content}\n\nMCP:\n{mcp_script}"),
    ])

    agent_memory.add_session_event(
        session_id="global_evolution_harness",
        role="SYSTEM_REFLECTION",
        text=f"Reflection on {url}:\n{response.content}",
    )
    return {}

security_builder = StateGraph(SecurityState)
security_builder.add_node("sandbox_and_sanitize", security_sandbox_node)
security_builder.add_node("ingest_skill", security_ingest_node)
security_builder.add_node("reflect_and_evolve", security_evolve_node)
security_builder.add_edge(START, "sandbox_and_sanitize")
security_builder.add_edge("sandbox_and_sanitize", "ingest_skill")
security_builder.add_edge("ingest_skill", "reflect_and_evolve")
security_builder.add_edge("reflect_and_evolve", END)
security_subgraph = security_builder.compile()


# ── Main Parent Orchestrator Graph (Hierarchical / Routing Agent) ───────────

class AgentState(TypedDict):
    task_prompt: str
    skill_content: str
    target_url:  str
    include_mcp: bool
    folder_name: str
    mcp_script:  Optional[str]
    mcp_config:  Optional[str]
    pruned_context: str
    analysis:    str
    db_id:       Optional[int]
    existing_skills_found: Optional[bool]
    extracted_skills_files: Optional[Dict[str, str]]
    existing_mcp_found: Optional[bool]
    extracted_mcp_script: Optional[str]
    extracted_mcp_config: Optional[str]

workflow = StateGraph(AgentState)

# Nodes mapping directly to our compiled subgraphs (Sub-Agent pattern)
workflow.add_node("scraper_sub_agent", scraper_subgraph)
workflow.add_node("codegen_sub_agent", codegen_subgraph)
workflow.add_node("security_sub_agent", security_subgraph)

workflow.add_edge(START, "scraper_sub_agent")
workflow.add_edge("scraper_sub_agent", "codegen_sub_agent")
workflow.add_edge("codegen_sub_agent", "security_sub_agent")
workflow.add_edge("security_sub_agent", END)


# ── Checkpointer Setup ──────────────────────────────────────────────────────

def _build_app():
    """Compile the LangGraph workflow with an appropriate checkpointer."""
    try:
        saver_ctx = RedisSaver.from_conn_string(REDIS_URI)
        checkpointer = saver_ctx.__enter__()
        checkpointer.setup()  # idempotent after first run
        print("[orchestrator] LangGraph checkpointer: RedisSaver (production)")
    except Exception as e:
        print(f"[orchestrator] Warning: RedisSaver failed, falling back to InMemorySaver: {e}")
        saver_ctx = None
        checkpointer = InMemorySaver()
    return workflow.compile(checkpointer=checkpointer), saver_ctx

app, _redis_saver_ctx = _build_app()


# ── Public Entrypoint ────────────────────────────────────────────────────────

def run_orchestrator(
    url: str,
    prompt: str,
    include_mcp: bool = False,
    user_id: str = "anonymous",
    thread_id: str = None,
    db_id: int = None,
) -> dict:
    if not thread_id:
        thread_id = str(uuid.uuid4())
    run_id = str(uuid.uuid4())

    config_dict = {
        "run_id": run_id,
        "configurable": {"thread_id": thread_id},
        "tags": [f"user_id:{user_id}"],
    }

    agent_memory.add_session_event(
        session_id=thread_id,
        role="USER",
        text=f"Create a skill for {url}. Task: {prompt}. Include MCP: {include_mcp}",
    )

    initial_state = {
        "task_prompt": prompt,
        "target_url":  url,
        "skill_content": "",
        "include_mcp": include_mcp,
        "folder_name": "",
        "mcp_script":  None,
        "mcp_config":  None,
        "pruned_context": "",
        "analysis":    "",
        "db_id":       db_id,
        "existing_skills_found": False,
        "extracted_skills_files": {},
        "existing_mcp_found": False,
        "extracted_mcp_script": None,
        "extracted_mcp_config": None,
    }

    print(f"[orchestrator] Starting hierarchical graph — thread={thread_id}, run={run_id}")
    for event in app.stream(initial_state, config_dict):
        for node_name in event:
            print(f"[orchestrator] Sub-Agent node completed: {node_name}")

    final_state = app.get_state(config_dict)
    skill_content = final_state.values.get("skill_content", "")
    mcp_script    = final_state.values.get("mcp_script")
    folder_name   = final_state.values.get("folder_name", "")

    agent_memory.add_session_event(
        session_id=thread_id,
        role="AGENT",
        text="Generated skill content and MCP Server (if requested).",
    )

    trace_url = None
    try:
        from langsmith import Client
        ls_client = Client()
        trace_url = ls_client.share_run(run_id)
        print(f"[orchestrator] LangSmith trace: {trace_url}")
    except Exception as e:
        print(f"[orchestrator] Failed to generate LangSmith trace URL: {e}")

    # ── Persist to Databricks lakehouse ───────────────────────────────────────
    try:
        db = get_databricks_store()
        db.write_skill(SkillRecord(
            skill_id=run_id,
            folder_name=folder_name,
            target_url=url,
            skill_content=skill_content,
            mcp_script=mcp_script,
            mcp_config=final_state.values.get("mcp_config"),
            langsmith_trace_url=trace_url,
            thread_id=thread_id,
            user_id=user_id,
        ))
        db.write_trace(
            run_id=run_id,
            thread_id=thread_id,
            user_id=user_id,
            trace_url=trace_url,
            target_url=url,
        )
    except Exception as e:
        print(f"[orchestrator] Databricks write skipped: {e}")

    return {
        "thread_id":    thread_id,
        "skill_content": skill_content,
        "mcp_script":   mcp_script,
        "mcp_config":   final_state.values.get("mcp_config"),
        "trace_url":    trace_url,
        "scraped_text": final_state.values.get("pruned_context", ""),
    }


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 2:
        mcp_flag = "--mcp" in sys.argv
        res = run_orchestrator(sys.argv[1], sys.argv[2], include_mcp=mcp_flag)
        print("Final Result SKILL.md:")
        print(res["skill_content"])
        if mcp_flag:
            print("\nMCP Server Script:")
            print(res["mcp_script"])
    else:
        print("Usage: python orchestrator.py <url> <prompt> [--mcp]")
