"""
databricks_store.py — Databricks lakehouse integration for Skill Maker.

Provides:
  • DatabricksStore   — persist skills + evaluation results to Delta Lake
  • list_skills()     — query the skills catalog from Unity Catalog
  • get_pipeline()    — return the DLT pipeline ID for the skills pipeline

All credentials are sourced from config.py (Infisical-injected) — never from .env.

Architecture:
  Unity Catalog schema:  skill_maker.skills
  Tables:
    skills              — one row per generated skill (SKILL.md content + metadata)
    evaluations         — LangSmith evaluation results linked to skills
    agent_traces        — LangSmith trace URLs per orchestrator run
  DLT pipeline:
    skill_ingestion     — incrementally ingests skills table into a refined layer
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any

from config import DATABRICKS_HOST, DATABRICKS_TOKEN

# ── Lazy SDK import ────────────────────────────────────────────────────────────
# databricks-sdk is optional — the rest of the agent runs without Databricks.


def _sdk():
    """Return databricks.sdk.WorkspaceClient, importing lazily."""
    try:
        from databricks.sdk import WorkspaceClient

        return WorkspaceClient
    except ImportError as exc:
        raise ImportError(
            "databricks-sdk is not installed. Run: pip install databricks-sdk"
        ) from exc


# ── Data models ────────────────────────────────────────────────────────────────


@dataclass
class SkillRecord:
    skill_id: str  # UUID from orchestrator run
    folder_name: str  # e.g. "stripe-api"
    target_url: str
    skill_content: str  # full SKILL.md markdown
    mcp_script: str | None
    mcp_config: str | None
    langsmith_trace_url: str | None
    thread_id: str
    user_id: str
    created_at: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    tags: list[str] = field(default_factory=list)

    def to_row(self) -> dict[str, Any]:
        d = asdict(self)
        mcp = d["mcp_config"]
        d["mcp_config"] = (
            json.dumps(mcp) if isinstance(mcp, dict) else (mcp if mcp else None)
        )
        d["tags"] = json.dumps(d["tags"])
        return d


@dataclass
class EvaluationRecord:
    eval_id: str
    skill_id: str
    prompt: str
    baseline_score: float
    guided_score: float
    baseline_output: str
    guided_output: str
    grades: list[dict]
    langsmith_experiment_prefix: str
    created_at: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )

    def to_row(self) -> dict[str, Any]:
        d = asdict(self)
        d["grades"] = json.dumps(d["grades"])
        return d


# ── Client wrapper ────────────────────────────────────────────────────────────


class DatabricksStore:
    """
    Thin wrapper around the Databricks SDK for Skill Maker persistence.

    Usage:
        store = DatabricksStore()
        store.ensure_schema()           # once on startup
        store.write_skill(record)
        store.write_evaluation(record)
        rows = store.list_skills(limit=50)
    """

    CATALOG = "skill_maker"
    SCHEMA = "skills"
    WAREHOUSE_NAME = "skill_maker_warehouse"

    # Short connection timeout so we fail fast in environments without outbound
    # access to Azure Databricks (e.g. local dev sandbox), rather than hanging
    # for 5 minutes waiting for the SDK's internal retry loop to exhaust.
    _HTTP_TIMEOUT_SECONDS = 10

    def __init__(self) -> None:
        if not DATABRICKS_HOST or not DATABRICKS_TOKEN:
            raise OSError(
                "DATABRICKS_HOST and DATABRICKS_TOKEN must be set in Infisical. "
                "They were not found in the current environment."
            )
        WorkspaceClient = _sdk()
        host = DATABRICKS_HOST.strip()
        if not host.startswith("http://") and not host.startswith("https://"):
            if host.isdigit():
                host = f"https://dbc-{host}.cloud.databricks.com"
            else:
                host = f"https://{host}"

        self._w = WorkspaceClient(
            host=host,
            token=DATABRICKS_TOKEN,
            # Fail fast — do not hang for minutes if the host is unreachable
            http_timeout_seconds=self._HTTP_TIMEOUT_SECONDS,
            retry_timeout_seconds=self._HTTP_TIMEOUT_SECONDS,
        )
        self._warehouse_id: str | None = None
        self.ensure_schema()

    # ── Warehouse resolution ───────────────────────────────────────────────────

    def _get_warehouse_id(self) -> str:
        if self._warehouse_id:
            return self._warehouse_id
        warehouses = list(self._w.warehouses.list())
        for wh in warehouses:
            if wh.name == self.WAREHOUSE_NAME:
                self._warehouse_id = wh.id
                return wh.id
        # Fall back to any running warehouse
        for wh in warehouses:
            if wh.state and wh.state.value == "RUNNING":
                self._warehouse_id = wh.id
                return wh.id
        raise RuntimeError(
            f"No SQL warehouse named '{self.WAREHOUSE_NAME}' found and no running warehouse "
            "available. Create a warehouse in the Databricks UI and re-run."
        )

    def _sql(self, statement: str, params: list | None = None) -> Any:
        """Execute a SQL statement via the Statement Execution API."""
        from databricks.sdk.service.sql import StatementState

        resp = self._w.statement_execution.execute_statement(
            warehouse_id=self._get_warehouse_id(),
            statement=statement,
            parameters=params or [],
            wait_timeout="30s",
        )
        if resp.status and resp.status.state == StatementState.FAILED:
            raise RuntimeError(f"Databricks SQL failed: {resp.status.error.message}")
        return resp

    # ── Schema bootstrap ───────────────────────────────────────────────────────

    def ensure_schema(self) -> None:
        """Create catalog, schema, and tables if they don't already exist."""
        ddl = [
            f"CREATE CATALOG IF NOT EXISTS {self.CATALOG}",
            f"CREATE SCHEMA IF NOT EXISTS {self.CATALOG}.{self.SCHEMA}",
            f"""
            CREATE TABLE IF NOT EXISTS {self.CATALOG}.{self.SCHEMA}.skills (
                skill_id              STRING   NOT NULL,
                folder_name           STRING,
                target_url            STRING,
                skill_content         STRING,
                mcp_script            STRING,
                mcp_config            STRING,    -- JSON
                langsmith_trace_url   STRING,
                thread_id             STRING,
                user_id               STRING,
                created_at            TIMESTAMP,
                tags                  STRING,    -- JSON array
                CONSTRAINT pk_skills PRIMARY KEY (skill_id)
            )
            USING DELTA
            TBLPROPERTIES (
                'delta.enableChangeDataFeed' = 'true'
            )
            """,
            f"""
            CREATE TABLE IF NOT EXISTS {self.CATALOG}.{self.SCHEMA}.evaluations (
                eval_id                     STRING   NOT NULL,
                skill_id                    STRING,
                prompt                      STRING,
                baseline_score              DOUBLE,
                guided_score                DOUBLE,
                baseline_output             STRING,
                guided_output               STRING,
                grades                      STRING,  -- JSON
                langsmith_experiment_prefix STRING,
                created_at                  TIMESTAMP,
                CONSTRAINT pk_evaluations PRIMARY KEY (eval_id)
            )
            USING DELTA
            """,
            f"""
            CREATE TABLE IF NOT EXISTS {self.CATALOG}.{self.SCHEMA}.agent_traces (
                run_id          STRING NOT NULL,
                thread_id       STRING,
                user_id         STRING,
                trace_url       STRING,
                target_url      STRING,
                created_at      TIMESTAMP
            )
            USING DELTA
            """,
        ]
        for stmt in ddl:
            self._sql(stmt.strip())
        print(f"[databricks] Schema {self.CATALOG}.{self.SCHEMA} ensured.")

    # ── Write helpers ──────────────────────────────────────────────────────────

    def write_skill(self, record: SkillRecord) -> None:
        """Upsert a SkillRecord into the skills Delta table."""
        row = record.to_row()
        self._sql(
            f"""
            MERGE INTO {self.CATALOG}.{self.SCHEMA}.skills AS t
            USING (SELECT
                :skill_id AS skill_id,
                :folder_name AS folder_name,
                :target_url AS target_url,
                :skill_content AS skill_content,
                :mcp_script AS mcp_script,
                :mcp_config AS mcp_config,
                :langsmith_trace_url AS langsmith_trace_url,
                :thread_id AS thread_id,
                :user_id AS user_id,
                CAST(:created_at AS TIMESTAMP) AS created_at,
                :tags AS tags
            ) AS s ON t.skill_id = s.skill_id
            WHEN MATCHED THEN UPDATE SET *
            WHEN NOT MATCHED THEN INSERT *
            """,
            params=[
                {"name": k, "value": None if v is None else str(v)}
                for k, v in row.items()
            ],
        )
        print(f"[databricks] Skill written: {record.skill_id} ({record.folder_name})")

    def write_evaluation(self, record: EvaluationRecord) -> None:
        """Insert an evaluation result into the evaluations Delta table."""
        row = record.to_row()
        self._sql(
            f"""
            INSERT INTO {self.CATALOG}.{self.SCHEMA}.evaluations VALUES (
                :eval_id, :skill_id, :prompt,
                CAST(:baseline_score AS DOUBLE), CAST(:guided_score AS DOUBLE),
                :baseline_output, :guided_output, :grades,
                :langsmith_experiment_prefix, CAST(:created_at AS TIMESTAMP)
            )
            """,
            params=[
                {"name": k, "value": None if v is None else str(v)}
                for k, v in row.items()
            ],
        )
        print(f"[databricks] Evaluation written: {record.eval_id}")

    def write_trace(
        self,
        run_id: str,
        thread_id: str,
        user_id: str,
        trace_url: str | None,
        target_url: str,
    ) -> None:
        """Record a LangSmith trace URL for an orchestrator run."""
        self._sql(
            f"""
            INSERT INTO {self.CATALOG}.{self.SCHEMA}.agent_traces
            VALUES (:run_id, :thread_id, :user_id, :trace_url, :target_url, current_timestamp())
            """,
            params=[
                {"name": "run_id", "value": run_id},
                {"name": "thread_id", "value": thread_id},
                {"name": "user_id", "value": user_id},
                {"name": "trace_url", "value": trace_url or ""},
                {"name": "target_url", "value": target_url},
            ],
        )

    # ── Query helpers ──────────────────────────────────────────────────────────

    def list_skills(
        self,
        user_id: str | None = None,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        """Return skills from the Delta table, optionally filtered by user."""
        where = "WHERE user_id = :user_id" if user_id else ""
        params = [{"name": "user_id", "value": user_id}] if user_id else None
        resp = self._sql(
            f"""
            SELECT skill_id, folder_name, target_url, langsmith_trace_url,
                   user_id, created_at, tags
            FROM {self.CATALOG}.{self.SCHEMA}.skills
            {where}
            ORDER BY created_at DESC
            LIMIT {limit}
            """,
            params=params,
        )
        rows = []
        if resp.result and resp.result.data_array:
            cols = [c.name for c in resp.manifest.schema.columns]
            for row in resp.result.data_array:
                rows.append(dict(zip(cols, row)))
        return rows

    def get_skill(self, skill_id: str) -> dict[str, Any] | None:
        """Fetch a single skill record by ID."""
        resp = self._sql(
            f"""
            SELECT * FROM {self.CATALOG}.{self.SCHEMA}.skills
            WHERE skill_id = :skill_id LIMIT 1
            """,
            params=[{"name": "skill_id", "value": skill_id}],
        )
        if resp.result and resp.result.data_array:
            cols = [c.name for c in resp.manifest.schema.columns]
            return dict(zip(cols, resp.result.data_array[0]))
        return None

    def list_evaluations(
        self,
        skill_id: str | None = None,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        """
        Return evaluation records from the evaluations Delta table.
        Used by skillopt_integration to build real training items.
        """
        where = "WHERE skill_id = :skill_id" if skill_id else ""
        params = [{"name": "skill_id", "value": skill_id}] if skill_id else None
        resp = self._sql(
            f"""
            SELECT eval_id, skill_id, prompt, guided_score, guided_output,
                   baseline_score, baseline_output, created_at
            FROM {self.CATALOG}.{self.SCHEMA}.evaluations
            {where}
            ORDER BY created_at DESC
            LIMIT {limit}
            """,
            params=params,
        )
        rows = []
        if resp.result and resp.result.data_array:
            cols = [c.name for c in resp.manifest.schema.columns]
            for row in resp.result.data_array:
                rows.append(dict(zip(cols, row)))
        return rows

    def search_ai_index(
        self,
        query_text: str,
        index_name: str = "skill_maker.skills.skills_vs_index",
        k: int = 5,
    ) -> list[dict[str, Any]]:
        """
        Query Databricks AI Search / Vector Search index.
        Falls back to Delta Lake SQL full-text / string search if Vector Search endpoint is offline or unavailable.
        """
        try:
            res = self._w.vector_search_indexes.search_index(
                index_name=index_name,
                query_text=query_text,
                columns=["skill_id", "folder_name", "target_url", "skill_content"],
                num_results=k,
            )
            if res and hasattr(res, "result") and res.result:
                data_array = res.result.data_array or []
                cols = (
                    [c.name for c in res.manifest.columns]
                    if res.manifest
                    else ["skill_id", "folder_name", "target_url", "skill_content"]
                )
                return [dict(zip(cols, row)) for row in data_array]
        except Exception as exc:
            err_msg = str(exc).lower()
            if "not found" in err_msg or "does not exist" in err_msg:
                print(
                    f"[databricks] Vector Search index '{index_name}' not found. "
                    f"Create it in the Databricks UI: Catalog Explorer → "
                    f"{self.CATALOG}.{self.SCHEMA} → Create → Vector Search Index. "
                    f"Falling back to Delta SQL text search."
                )
            else:
                print(f"[databricks] Vector search fallback to Delta SQL: {exc}")

        # Fallback: Delta SQL text query on skills table
        try:
            like_pattern = f"%{query_text}%"
            resp = self._sql(
                f"""
                SELECT skill_id, folder_name, target_url, skill_content
                FROM {self.CATALOG}.{self.SCHEMA}.skills
                WHERE lower(skill_content) LIKE lower(:like_pattern)
                   OR lower(folder_name) LIKE lower(:like_pattern)
                ORDER BY created_at DESC
                LIMIT {k}
                """,
                params=[{"name": "like_pattern", "value": like_pattern}],
            )
            rows = []
            if resp.result and resp.result.data_array:
                cols = [c.name for c in resp.manifest.schema.columns]
                for row in resp.result.data_array:
                    rows.append(dict(zip(cols, row)))
            return rows
        except Exception as e:
            print(f"[databricks] SQL fallback query failed: {e}")
            return []

    # ── DLT pipeline ──────────────────────────────────────────────────────────

    def get_pipeline_id(self, pipeline_name: str = "skill_ingestion") -> str | None:
        """Return the DLT pipeline ID for the named pipeline."""
        for p in self._w.pipelines.list_pipelines():
            if p.name == pipeline_name:
                return p.pipeline_id
        return None

    def trigger_pipeline(self, pipeline_name: str = "skill_ingestion") -> str | None:
        """Trigger a full refresh of the DLT ingestion pipeline."""
        pipeline_id = self.get_pipeline_id(pipeline_name)
        if not pipeline_id:
            print(
                f"[databricks] Pipeline '{pipeline_name}' not found — skipping trigger."
            )
            return None
        update = self._w.pipelines.start_update(
            pipeline_id=pipeline_id, full_refresh=False
        )
        print(
            f"[databricks] Pipeline '{pipeline_name}' triggered: update_id={update.update_id}"
        )
        return update.update_id


# ── Physical Local Lakehouse Store ─────────────────────────────────────────────

import os
import sqlite3


class LocalLakehouseStore:
    """
    Physical local Lakehouse Store implementing the exact same interface as DatabricksStore.
    Uses SQLite database at agent/data/lakehouse.sqlite to guarantee physical disk persistence
    for all skill records, evaluation outputs, and agent traces.
    """

    def __init__(self, db_path: str | None = None) -> None:
        if db_path is None:
            base_dir = os.path.dirname(os.path.abspath(__file__))
            data_dir = os.path.join(base_dir, "data")
            os.makedirs(data_dir, exist_ok=True)
            db_path = os.path.join(data_dir, "lakehouse.sqlite")
        self.db_path = db_path
        self.ensure_schema()

    def _get_conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def ensure_schema(self) -> None:
        with self._get_conn() as conn:
            conn.execute("""
            CREATE TABLE IF NOT EXISTS skills (
                skill_id TEXT PRIMARY KEY,
                folder_name TEXT,
                target_url TEXT,
                skill_content TEXT,
                mcp_script TEXT,
                mcp_config TEXT,
                langsmith_trace_url TEXT,
                thread_id TEXT,
                user_id TEXT,
                created_at TEXT,
                tags TEXT
            )
            """)
            conn.execute("""
            CREATE TABLE IF NOT EXISTS evaluations (
                eval_id TEXT PRIMARY KEY,
                skill_id TEXT,
                prompt TEXT,
                baseline_score REAL,
                guided_score REAL,
                baseline_output TEXT,
                guided_output TEXT,
                grades TEXT,
                langsmith_experiment_prefix TEXT,
                created_at TEXT
            )
            """)
            conn.execute("""
            CREATE TABLE IF NOT EXISTS agent_traces (
                run_id TEXT PRIMARY KEY,
                thread_id TEXT,
                user_id TEXT,
                trace_url TEXT,
                target_url TEXT,
                created_at TEXT
            )
            """)
            conn.commit()
        print(f"[lakehouse] Physical SQLite Lakehouse schema ensured at {self.db_path}")

    def write_skill(self, record: SkillRecord) -> None:
        row = record.to_row()
        with self._get_conn() as conn:
            conn.execute(
                """
            INSERT OR REPLACE INTO skills (
                skill_id, folder_name, target_url, skill_content, mcp_script, mcp_config,
                langsmith_trace_url, thread_id, user_id, created_at, tags
            ) VALUES (
                :skill_id, :folder_name, :target_url, :skill_content, :mcp_script, :mcp_config,
                :langsmith_trace_url, :thread_id, :user_id, :created_at, :tags
            )
            """,
                row,
            )
            conn.commit()
        print(
            f"[lakehouse] Skill physically written to SQLite Lakehouse: {record.skill_id} ({record.folder_name})"
        )

    def write_evaluation(self, record: EvaluationRecord) -> None:
        row = record.to_row()
        with self._get_conn() as conn:
            conn.execute(
                """
            INSERT OR REPLACE INTO evaluations (
                eval_id, skill_id, prompt, baseline_score, guided_score,
                baseline_output, guided_output, grades, langsmith_experiment_prefix, created_at
            ) VALUES (
                :eval_id, :skill_id, :prompt, :baseline_score, :guided_score,
                :baseline_output, :guided_output, :grades, :langsmith_experiment_prefix, :created_at
            )
            """,
                row,
            )
            conn.commit()
        print(
            f"[lakehouse] Evaluation physically written to SQLite Lakehouse: {record.eval_id}"
        )

    def write_trace(
        self,
        run_id: str,
        thread_id: str,
        user_id: str,
        trace_url: str | None,
        target_url: str,
    ) -> None:
        now_iso = datetime.now(timezone.utc).isoformat()
        with self._get_conn() as conn:
            conn.execute(
                """
            INSERT OR REPLACE INTO agent_traces (
                run_id, thread_id, user_id, trace_url, target_url, created_at
            ) VALUES (?, ?, ?, ?, ?, ?)
            """,
                (run_id, thread_id, user_id, trace_url or "", target_url, now_iso),
            )
            conn.commit()

    def list_skills(
        self, user_id: str | None = None, limit: int = 100
    ) -> list[dict[str, Any]]:
        with self._get_conn() as conn:
            if user_id:
                cur = conn.execute(
                    "SELECT * FROM skills WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
                    (user_id, limit),
                )
            else:
                cur = conn.execute(
                    "SELECT * FROM skills ORDER BY created_at DESC LIMIT ?", (limit,)
                )
            return [dict(r) for r in cur.fetchall()]

    def get_skill(self, skill_id: str) -> dict[str, Any] | None:
        with self._get_conn() as conn:
            cur = conn.execute(
                "SELECT * FROM skills WHERE skill_id = ? LIMIT 1", (skill_id,)
            )
            r = cur.fetchone()
            return dict(r) if r else None

    def list_evaluations(
        self, skill_id: str | None = None, limit: int = 50
    ) -> list[dict[str, Any]]:
        with self._get_conn() as conn:
            if skill_id:
                cur = conn.execute(
                    "SELECT * FROM evaluations WHERE skill_id = ? ORDER BY created_at DESC LIMIT ?",
                    (skill_id, limit),
                )
            else:
                cur = conn.execute(
                    "SELECT * FROM evaluations ORDER BY created_at DESC LIMIT ?",
                    (limit,),
                )
            return [dict(r) for r in cur.fetchall()]

    def search_ai_index(
        self, query_text: str, index_name: str = "skills_vs_index", k: int = 5
    ) -> list[dict[str, Any]]:
        clean_q = f"%{query_text.strip().lower()}%"
        with self._get_conn() as conn:
            cur = conn.execute(
                """
            SELECT skill_id, folder_name, target_url, skill_content
            FROM skills
            WHERE lower(skill_content) LIKE ? OR lower(folder_name) LIKE ?
            ORDER BY created_at DESC
            LIMIT ?
            """,
                (clean_q, clean_q, k),
            )
            return [dict(r) for r in cur.fetchall()]

    def get_pipeline_id(self, pipeline_name: str = "skill_ingestion") -> str | None:
        return "local_dlt_pipeline_001"

    def trigger_pipeline(self, pipeline_name: str = "skill_ingestion") -> str | None:
        import uuid

        return f"local_update_{uuid.uuid4().hex[:8]}"


# ── Module-level lazy singleton ────────────────────────────────────────────────

_store: DatabricksStore | LocalLakehouseStore | None = None


def get_store() -> DatabricksStore | LocalLakehouseStore:
    """
    Return the process-level LakehouseStore singleton (lazy init).
    Guaranteed to return an active physical store (DatabricksStore or LocalLakehouseStore).
    """
    global _store
    if _store is None:
        try:
            _store = DatabricksStore()
            print("[lakehouse] Connected to Databricks Workspace Store.")
        except Exception as exc:
            print(
                f"[lakehouse] Remote Databricks unavailable ({exc}) — initializing physical LocalLakehouseStore."
            )
            _store = LocalLakehouseStore()
    return _store
