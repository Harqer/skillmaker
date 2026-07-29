import config  # noqa — runs Infisical SDK bootstrap and sets env vars
from config import REDIS_URI
from redis import Redis
from rq import Connection, Worker

conn = Redis.from_url(REDIS_URI)

if __name__ == "__main__":
    print("Starting RQ Worker for Skill-Maker...")
    with Connection(conn):
        worker = Worker(["default"])
        worker.work()
