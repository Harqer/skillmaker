#!/home/shaolin/ABSO/.venv/bin/python3
"""Load .env and start uvicorn."""
import os
import sys

os.chdir(os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv
load_dotenv('.env')

# Strip unsupported pg parameter
db_url = os.environ.get('DATABASE_URL', '')
if db_url:
    os.environ['DATABASE_URL'] = db_url.replace('&channel_binding=require', '')

import uvicorn
uvicorn.run('api:app', host='0.0.0.0', port=8000, reload=True)
