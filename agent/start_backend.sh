#!/bin/bash
set -a
. /home/shaolin/ABSO/agent/.env
DATABASE_URL="${DATABASE_URL/&channel_binding=require/}"
set +a
cd /home/shaolin/ABSO/agent
exec /home/shaolin/ABSO/.venv/bin/python3 -m uvicorn api:app --reload --port 8000 --host 0.0.0.0
