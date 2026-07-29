from sqlmodel import Session
from core.ports import IUnitOfWork
from repositories.sqlmodel_repos import SQLModelUserRepository, SQLModelSkillRequestRepository
from db import engine

class SQLModelUnitOfWork(IUnitOfWork):
    def __init__(self):
        self.session_factory = lambda: Session(engine)

    def __enter__(self):
        self.session = self.session_factory()
        self.users = SQLModelUserRepository(self.session)
        self.skills = SQLModelSkillRequestRepository(self.session)
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        try:
            if exc_type is not None:
                self.rollback()
            else:
                self.commit()
        finally:
            self.session.close()

    def commit(self) -> None:
        self.session.commit()

    def rollback(self) -> None:
        self.session.rollback()
