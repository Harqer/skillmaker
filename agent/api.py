import os
import sys

import config  # noqa — sets env vars at import time
from db import init_db
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Ensure dependencies under current directory are importable
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from controllers.routes import router

app = FastAPI(title="Zap Autonomous Agent Compiler API")

# Setup CORS Middlewares
allowed_origins = os.environ.get("FRONTEND_URL", "http://localhost:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    init_db()


# Mount our clean Presentation/Controller routes
app.include_router(router)
