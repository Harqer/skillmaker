from typing import Optional, List, Dict, Any
from core.ports import IWikiMemoryPort
from deep_wiki_memory import DeepWikiMemory

class DeepWikiMemoryAdapter(IWikiMemoryPort):
    def __init__(self):
        self._memory = DeepWikiMemory()

    def store(self, doc_id: str, title: str, content: str) -> int:
        return self._memory.store_document(
            doc_id=doc_id,
            title=title,
            content=content
        )

    def search(self, query: str, doc_id: Optional[str] = None, limit: int = 5) -> List[Dict[str, Any]]:
        return self._memory.search_wiki(
            query=query,
            doc_id=doc_id,
            k=limit
        )
