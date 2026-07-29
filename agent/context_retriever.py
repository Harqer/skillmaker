import asyncio
from typing import Any

from config import CTX_AGENT_KEY
from context_surfaces import ContextField, ContextModel, UnifiedClient
from langchain_core.tools import tool


class WorkspaceContext(ContextModel):
    """Governed access to API specs, code guidelines, and past subagent skills."""

    __redis_key_template__ = "workspace:{id}"

    id: str = ContextField(description="Unique ID", is_key_component=True)
    title: str = ContextField(description="Title", index="text")
    content: str = ContextField(description="Content", index="text")
    embedding: list[float] = ContextField(
        description="Vector embedding",
        index="vector",
        vector_dim=768,
        distance_metric="cosine",
        default_factory=list,
    )
    metadata: str = ContextField(description="JSON metadata", index="text", default="")


def get_context_tools() -> list[Any]:
    """Get the LangChain tools exposed by the Redis Context Retriever."""

    @tool
    def query_business_context(query: str) -> str:
        """Retrieve operational business context, API documentation, or code guidelines from Redis."""

        # This uses the Context Surfaces UnifiedClient to invoke the MCP tools deployed in production.
        # It relies on CTX_AGENT_KEY, CTX_API_URL, and CTX_MCP_URL environment variables.
        async def run_query():
            try:
                # In production, ensure CTX_AGENT_KEY is set in Infisical.
                if not CTX_AGENT_KEY:
                    return "Error: CTX_AGENT_KEY is not configured in Infisical."

                async with UnifiedClient() as client:
                    result = await client.query_tool(
                        agent_key=CTX_AGENT_KEY,
                        tool_name="search_workspacecontext_by_text",
                        arguments={"query": query, "limit": 5},
                    )
                    return str(result)
            except Exception as e:
                return f"Failed to retrieve context from Redis Context Retriever: {e}"

        return asyncio.run(run_query())

    @tool
    def search_deep_wiki_memory(query: str) -> str:
        """Retrieve semantic wiki pages, wiki documentation, or knowledge base entries from the Deep Wiki Memory."""
        try:
            from deep_wiki_memory import DeepWikiMemory

            wiki = DeepWikiMemory()
            results = wiki.search_wiki(query=query, k=5)
            import json

            return json.dumps(results, indent=2)
        except Exception as e:
            return f"Failed to query Deep Wiki Memory: {e}"

    @tool
    def query_databricks_ai_search(query: str) -> str:
        """Query Databricks AI Search / Lakehouse Vector Search index for indexed documentation, skills, and Delta Lake records."""
        try:
            from databricks_store import get_store

            store = get_store()
            if not store:
                return "Databricks Store is not configured or unavailable."
            results = store.search_ai_index(query_text=query, k=5)
            import json

            return json.dumps(results, indent=2)
        except Exception as e:
            return f"Failed to query Databricks AI Search: {e}"

    return [query_business_context, search_deep_wiki_memory, query_databricks_ai_search]
