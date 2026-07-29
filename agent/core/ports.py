from abc import ABC, abstractmethod
from typing import Optional, List, Dict, Any, Generic, TypeVar
from datetime import datetime

T = TypeVar('T')

class IUserRepository(ABC):
    @abstractmethod
    def get(self, user_id: str) -> Optional[Any]:
        pass

    @abstractmethod
    def add(self, user: Any) -> None:
        pass

    @abstractmethod
    def delete(self, user_id: str) -> None:
        pass

    @abstractmethod
    def upsert(self, user_id: str, email: str, first_name: Optional[str], last_name: Optional[str]) -> Any:
        pass


class ISkillRequestRepository(ABC):
    @abstractmethod
    def get(self, db_id: int) -> Optional[Any]:
        pass

    @abstractmethod
    def add(self, request: Any) -> None:
        pass

    @abstractmethod
    def update(self, request: Any) -> None:
        pass


class IUnitOfWork(ABC):
    users: IUserRepository
    skills: ISkillRequestRepository

    @abstractmethod
    def __enter__(self):
        pass

    @abstractmethod
    def __exit__(self, exc_type, exc_val, exc_tb):
        pass

    @abstractmethod
    def commit(self) -> None:
        pass

    @abstractmethod
    def rollback(self) -> None:
        pass


class IWikiMemoryPort(ABC):
    @abstractmethod
    def store(self, doc_id: str, title: str, content: str) -> int:
        pass

    @abstractmethod
    def search(self, query: str, doc_id: Optional[str] = None, limit: int = 5) -> List[Dict[str, Any]]:
        pass
