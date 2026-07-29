from typing import Optional, Any
from sqlmodel import Session
from core.ports import IUserRepository, ISkillRequestRepository
from db_models import User, SkillRequest

class SQLModelUserRepository(IUserRepository):
    def __init__(self, session: Session):
        self.session = session

    def get(self, user_id: str) -> Optional[User]:
        return self.session.get(User, user_id)

    def add(self, user: User) -> None:
        self.session.add(user)

    def delete(self, user_id: str) -> None:
        user = self.get(user_id)
        if user:
            self.session.delete(user)

    def upsert(self, user_id: str, email: str, first_name: Optional[str], last_name: Optional[str]) -> User:
        user = self.get(user_id)
        if not user:
            user = User(id=user_id, email=email, first_name=first_name, last_name=last_name)
            self.add(user)
        else:
            user.email = email
            user.first_name = first_name
            user.last_name = last_name
        return user


class SQLModelSkillRequestRepository(ISkillRequestRepository):
    def __init__(self, session: Session):
        self.session = session

    def get(self, db_id: int) -> Optional[SkillRequest]:
        return self.session.get(SkillRequest, db_id)

    def add(self, request: SkillRequest) -> None:
        self.session.add(request)

    def update(self, request: SkillRequest) -> None:
        self.session.add(request)
