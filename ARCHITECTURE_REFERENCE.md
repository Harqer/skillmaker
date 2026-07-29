# Raven Platform Architecture & Component Reference

This document serves as the canonical reference for the technical architecture, repository ecosystem, and backend workflow orchestration of **Raven**, explaining how domain documentation and GitHub repositories are transformed into production-grade **EVE Skill Bundles** via **Raven Autonomous Skill & SkillOpt Platform**, **Loop Engineering Agentic Workflows**, **Firecrawl Scraper Engine**, **Databricks Lakehouse Vector Search**, **Gemini LLM Synthesis**, **LangGraph Orchestration**, **SkillOpt Trajectory Mining**, and **Redis Iris Context Services**.

---

## Repository Ecosystem & Module Roles

| Repository / Module | Primary Purpose & Technical Role |
|---|---|
| **Raven Platform** (`evermind-ai/raven`) | **Core Autonomous Skill Generator & Agent Harness.** Provides the central compiler infrastructure, EVE specification standard, and lifecycle management for agentic skills. |
| **Loop Engineering** (`cobusgreyling/loop-engineering`) | **Reflective Agent Loop Architecture.** Implements multi-turn reasoning cycles, reflective self-correction loops, state-machine verification (`subagents/loop_evaluator.md`), and trajectory optimization (`subagents/trajectory_optimizer.md`). |
| **Firecrawl / Scraper Subsystem** (`agent/scraper.py`) | **Documentation & Repository Ingestion Engine.** Discovers web links, clones git repositories, parses API specs, and strips web noise into clean, structured Markdown file trees. |
| **Databricks Lakehouse Vector Search** (`agent/context_retriever.py`) | **Semantic RAG & Vector Indexing.** Streams Markdown content into Delta Lake (`skill_maker.skills`) and powers vector search indices (`skill_maker.skills.skills_vs_index`) for contextual RAG retrieval. |
| **LLM Synthesis & EVE Compiler** (`src/server/ai.ts`) | **EVE Skill Bundle Generation.** Driven by Gemini 2.5 Flash / Omni models to transform raw research corpora into standardized multi-file EVE bundles (`instructions.md`, `subagents/`, `skills/SKILL.md`, `rules/`, and MCP server tools). |
| **SkillOpt Trajectory Mining Engine** (`SkillOpt/`, `agent/skillopt_integration.py`) | **Execution Benchmark & Gated Optimization.** Replays agent trajectories across benchmark suites, mines execution failures, and applies gated slow updates during background "sleep cycles" to refine rules without accuracy regressions. |
| **LangGraph / LangChain / LangSmith** | **Backend Workflow Orchestration & Telemetry.** Manages state machine routing across multi-turn agent loops and streams execution trace logs to LangSmith for trajectory analysis. |
| **Redis Iris Context & Caching Layer** (`src/server/ai.ts`, `src/server/skills.ts`) | **Front-Door Semantic Cache & Runtime Memory.** Provides sub-millisecond prompt interception (LangCache), governed tool search (Context Retriever), two-tier Agent Memory, and real-time CDC synchronization (RDI). |

---

## High-Level Architectural Pipeline & Backend Orchestration

```
                  ┌──────────────────────────────────────────────┐
                  │   User Submits Domain URL / GitHub Repo     │
                  │ (e.g. cobusgreyling/loop-engineering, Stripe)│
                  └──────────────────────┬───────────────────────┘
                                         │
                                         ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ Stage 0: Front-Door Semantic Interception & Cache (Redis LangCache)             │
│ - Sub-millisecond prompt interception for previously compiled domains           │
│ - HIT  ➔ Returns cached EVE Skill Bundle & MCP Tool immediately                │
│ - MISS ➔ Triggers Backend Workflow Orchestration                                │
└────────────────────────────────────────┬────────────────────────────────────────┘
                                         │ Cache Miss
                                         ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ Stage 1: Document Ingestion & Repository Cloning (Firecrawl Scraper Engine)     │
│ - Crawls documentation site / clones target GitHub repository                   │
│ - Extracts clean Markdown trees, resolving sub-paths, code signatures, & specs    │
└────────────────────────────────────────┬────────────────────────────────────────┘
                                         │ Clean Markdown Streams
                                         ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ Stage 2: Lakehouse Vector Search & Semantic RAG (Databricks + Delta Lake)       │
│ - Streams raw Markdown corpora into Delta Lake (`skill_maker.skills`)          │
│ - Auto-generates vector search index (`skill_maker.skills.skills_vs_index`)     │
│ - Discovers official pre-built skills, MCP tool declarations, & API schemas     │
└────────────────────────────────────────┬────────────────────────────────────────┘
                                         │ Indexed Context Corpus & Discovered Specs
                                         ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ Stage 3: Reflective Loop Orchestration (LangGraph + Loop Engineering)           │
│ - Initiates reflective multi-turn reasoning loops (`cobusgreyling/loop-eng`)   │
│ - Delegated Evaluator (`subagents/loop_evaluator.md`) verifies output state      │
│ - Bounded loop guards (`max_iterations: 5`) prevent infinite recursion           │
└────────────────────────────────────────┬────────────────────────────────────────┘
                                         │ Validated Loop State & Reasoning Artifacts
                                         ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ Stage 4: EVE Skill Bundle Synthesis (Gemini 2.5 Flash / Omni LLM Compiler)      │
│ - Generates Lead Coordinator (`instructions.md`) with intent routing rules      │
│ - Generates Specialized Subagents (`subagents/*.md`) with bounded loop guards   │
│ - Generates SkillOpt Trained Skill (`skills/SKILL.md`) with trigger rules       │
│ - Generates Python FastMCP Tool Server script & MCP Server JSON config          │
└────────────────────────────────────────┬────────────────────────────────────────┘
                                         │ Unoptimized EVE Skill Bundle
                                         ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ Stage 5: Trajectory Mining & SkillOpt Refinement (SkillOpt + LangSmith Tracing) │
│ - Executes multi-turn benchmark task suites across candidate skill bundle       │
│ - LangSmith traces execution trajectories & captures failure/hallucination logs │
│ - Trajectory Optimizer (`subagents/trajectory_optimizer.md`) mines root causes  │
│ - Background "Sleep Cycle" applies gated slow updates & negative rules to skill  │
└────────────────────────────────────────┬────────────────────────────────────────┘
                                         │ High-Performance Domain Expert EVE Skill
                                         ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ Stage 6: Skill Publication & Execution Layer (Redis Iris Runtime & Catalog)     │
│ - Registers domain expert skill in Raven Skill Catalog                          │
│ - Exposes governed MCP server tools via Redis Context Retriever                 │
│ - Pre-warms LangCache semantic lookup for instant zero-token agent reuse        │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Detailed Step-by-Step Workflow Orchestration

### Step 1: Ingestion & Parsing (Firecrawl Scraper)
* **Trigger:** User submits a documentation URL or GitHub repository URL via the Skill Compiler UI.
* **Process:**
  1. `agent/scraper.py` initiates a Firecrawl web crawl or git clone of the target repository.
  2. Sub-pages, code signatures, API endpoint definitions, and guide documents are stripped of extraneous noise (navbars, scripts, footers).
  3. Content is normalized into a clean, structured tree of Markdown streams.

### Step 2: Semantic RAG & Lakehouse Indexing (Databricks & Delta Lake)
* **Process:**
  1. Ingested Markdown streams are auto-loaded into Databricks Delta Lake (`skill_maker.skills`).
  2. Databricks Vector Search automatically generates vector embeddings (`skill_maker.skills.skills_vs_index`).
  3. Pre-existing skill manifests (e.g. `@tanstack/intent`, MCP configurations, OpenAPI specs) are automatically discovered to prevent duplicate generation.

### Step 3: Reflective Loop Engineering (LangGraph & Loop Engineering)
* **Architecture:** Uses `cobusgreyling/loop-engineering` patterns for compound agentic reasoning cycles.
* **Process:**
  1. **Lead Orchestrator:** Decomposes target domain capabilities into specialized skill subagents.
  2. **Evaluator Subagent (`subagents/loop_evaluator.md`):** Inspects candidate domain instructions against strict constraint criteria.
  3. **Loop Bounds:** Ensures all reasoning iterations are strictly bounded by `max_iterations: 5` to prevent infinite execution loops.

### Step 4: EVE Skill Bundle Compiler (Gemini 2.5 Flash / Omni LLM)
* **Format:** Produces a standardized multi-file EVE skill bundle:
  * `instructions.md`: High-level routing directives and subagent delegation maps.
  * `subagents/`: Specialist subagent directives with explicit evaluation and loop constraints.
  * `skills/SKILL.md`: Core domain skill definition with explicit trigger conditions, negative constraints, and zero-token interception patterns.
  * `rules/`: Modular edge-case handling rules.
  * `scripts/`: Executable Model Context Protocol (MCP) server script powered by Python `FastMCP`.

### Step 5: Trajectory Mining & SkillOpt Optimization (SkillOpt + LangSmith)
* **Process:**
  1. The compiled skill bundle undergoes benchmark evaluation across task suites.
  2. Execution traces are recorded in LangSmith to capture agent reasoning trajectories.
  3. **Trajectory Optimizer (`subagents/trajectory_optimizer.md`):** Analyzes execution logs to extract hallucination patterns or failed tool calls.
  4. **Gated Sleep Cycle:** A background optimization process synthesizes negative constraints and rule refinements, committing changes only if validation accuracy improves.

### Step 6: Skill Catalog Deployment & Redis Iris Runtime Execution
* **Outcome:** The domain expert EVE Skill is saved in the database catalog (`/src/lib/db/index.ts`).
* **Runtime Features:**
  * **LangCache:** Caches prompt responses semantically, delivering sub-millisecond responses on future queries.
  * **Context Retriever:** Governs MCP tool discovery and execution at runtime without tool sprawl.
  * **Agent Memory:** Promotes short-term conversation context to long-term vector memory.

---

## Summary Matrix

| Orchestration Stage | Primary Module | Core Function | Primary Artifact Produced |
|---|---|---|---|
| **0. Semantic Interception** | Redis LangCache | Prompt interception & sub-ms lookup | Instant cached answer / miss signal |
| **1. Scraping & Ingestion** | Firecrawl (`agent/scraper.py`) | URL crawl & git clone | Clean Markdown file trees |
| **2. Vector RAG Indexing** | Databricks Lakehouse | Vector search indexing & spec discovery | Delta Lake vector index (`skills_vs_index`) |
| **3. Reflective Loops** | LangGraph + Loop Engineering | Multi-turn reasoning & state validation | Verified domain reasoning graph |
| **4. EVE Skill Compilation** | Gemini LLM Synthesis | EVE bundle & MCP tool synthesis | EVE Skill Bundle (`instructions.md`, `SKILL.md`) |
| **5. Trajectory Optimization** | SkillOpt Engine + LangSmith | Failure mining & sleep-cycle tuning | Optimized, benchmark-proven EVE Skill |
| **6. Catalog & Runtime** | Redis Iris Runtime Layer | Tool search, session memory, & CDC sync | Ready-to-use Domain Expert Skill |

---

## Developer Guidelines
1. All generated skills **MUST** conform to the EVE file bundle specification (`instructions.md`, `subagents/`, `skills/SKILL.md`, `mcpScript`, `mcpConfig`).
2. Every subagent **MUST** enforce `max_iterations: 5` to prevent infinite agentic loop execution.
3. Repositories (`evermind-ai/raven`, `cobusgreyling/loop-engineering`) work together in the pipeline to construct, validate, and optimize domain experts.


