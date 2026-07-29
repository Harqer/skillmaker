import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

// In-memory mock structures for graceful fallback when DATABASE_URL is not set
// biome-ignore lint/suspicious/noExplicitAny: custom fallback
export const inMemorySkills: any[] = [
	{
		id: "raven-1",
		title: "Raven Autonomous Skill & SkillOpt Platform",
		description:
			"Production EVE Skill Synthesis, Trajectory Mining, and SkillOpt Gated Optimization for AI Agents.",
		content: JSON.stringify({
			"instructions.md": `# Lead Agent Coordinator - Raven Platform
You are the Lead Coordinator agent specializing in the Raven Skill Engine, Firecrawl ingestion, and SkillOpt optimization pipeline under the EVE specification.

## Routing & Intent Architecture
1. **Primary Intent Classifier**: Route skill synthesis to Stage 2 LLM Synthesis, and skill optimization to Stage 3 SkillOpt Engine.
2. **Subagent Delegation**:
   - Route documentation crawling & ingestion to \`/subagents/firecrawl_ingestor.md\`.
   - Route trajectory mining and slow-update gates to \`/subagents/skillopt_optimizer.md\`.
3. **Execution Guard**: Ensure max iteration depth across subagent loops is capped at 5.`,
			"subagents/firecrawl_ingestor.md": `# Firecrawl & Scraping Subagent
Specialized subagent for parsing documentation trees into clean Markdown.

## Directives
- Extract clean structured Markdown files from root documentation URLs.
- Filter out navbar/footer noise and resolve relative code blocks.
- Constraint: \`max_iterations: 5\`.`,
			"subagents/skillopt_optimizer.md": `# SkillOpt Optimization Subagent
Specialized subagent for evaluation, trajectory mining, and gated sleep cycle rule refinement.

## Directives
- Replay test tasks across benchmark suites (DocVQA, SearchQA, OfficeQA).
- Mine failure trajectories and harvest evidence during sleep cycles.
- Enforce gated slow updates to prevent accuracy regression.
- Constraint: \`max_iterations: 5\`.`,
			"skills/SKILL.md": `# SkillOpt Trained Skill: Raven Platform Architect
You are a principal AI agent developer specializing in Raven EVE Skill Generation and SkillOpt Optimization.

## Operational Directives
1. **Pipeline Execution**: Maintain strict data flow: Ingest (Firecrawl) -> Draft (Gemini LLM) -> Optimize (SkillOpt) -> Serve (MCP/EVE).
2. **EVE Spec Compliance**: Output structured skill bundles containing instructions.md, subagents/, skills/SKILL.md, and rules/.
3. **Trajectory Mining**: Mine failed rollouts to refine negative constraints and operational rules without regression.`,
		}),
		tags: ["Raven", "SkillOpt", "EVE", "Agent Platform"],
		authorId: "user_mock",
		upvotes: 24,
		mcpScript: `# Raven MCP Tool
from mcp.server.fastmcp import FastMCP
mcp = FastMCP("raven-mcp")

@mcp.tool()
async def synthesize_skill(source_url: str) -> str:
    """Synthesizes an EVE agent skill bundle from documentation."""
    return f"EVE Skill synthesized for {source_url}"
`,
		mcpConfig: JSON.stringify({
			mcpServers: {
				raven: {
					command: "python",
					args: ["-m", "raven_mcp"],
				},
			},
		}),
		traceUrl:
			"https://smith.langchain.com/o/raven-compiler/projects/p/raven-platform",
		sourceUrl: "https://github.com/EverMind-AI/Raven.git",
		createdAt: new Date().toISOString(),
	},
	{
		id: "loop-eng-1",
		title: "Loop Engineering Agentic Workflow Architecture",
		description:
			"Production EVE Skill Bundle for Loop Engineering (Cobus Greyling), implementing reflective agent loops, multi-turn reasoning cycles, and trajectory evaluation.",
		content: JSON.stringify({
			"instructions.md": `# Lead Agent Coordinator - Loop Engineering
You are the Lead Coordinator agent specializing in Loop Engineering (Cobus Greyling) compound agentic systems and reflective loop design under the EVE specification.

## Routing & Intent Architecture
1. **Loop Orchestrator**: Direct complex task decomposition into reflective iterative loops with explicit feedback triggers.
2. **Subagent Delegation**:
   - Route loop convergence evaluation & state verification to \`/subagents/loop_evaluator.md\`.
   - Route execution trajectory mining & prompt optimization to \`/subagents/trajectory_optimizer.md\`.
3. **Execution Guard**: Ensure maximum loop iterations across agent reasoning cycles are bounded (default max_iterations: 5).`,
			"subagents/loop_evaluator.md": `# Loop Evaluator & Self-Correction Subagent
Specialized subagent for evaluating agent output against task constraints and triggering recursive repair loops.

## Directives
- Evaluate intermediate output quality against target domain criteria.
- Inspect state transitions and provide explicit correction feedback to primary agent workers.
- Constraint: \`max_iterations: 5\`.`,
			"subagents/trajectory_optimizer.md": `# Loop Trajectory Optimizer Subagent
Specialized subagent for analyzing multi-turn agent logs and optimizing loop prompts.

## Directives
- Mine trajectory logs from failed or suboptimal agent runs.
- Distill root cause failures into negative rules and explicit boundary constraints.
- Constraint: \`max_iterations: 5\`.`,
			"skills/SKILL.md": `# SkillOpt Trained Skill: Loop Engineering Architect
You are a principal AI agent developer specializing in Loop Engineering, Compound AI Systems, and Reflective Agent Loops.

## Operational Directives
1. **Iterative Reflection**: Construct agent loops with explicit evaluation steps before finalizing output.
2. **State Machine Bounding**: Guard against infinite recursion by maintaining step counters and state diff checks.
3. **EVE Spec Compliance**: Standardize loop structures across instructions.md, subagents/, and rules/.`,
		}),
		tags: [
			"Loop Engineering",
			"Agentic Loops",
			"EVE",
			"Agent Workflows",
			"Cobus Greyling",
		],
		authorId: "user_mock",
		upvotes: 31,
		mcpScript: `# Loop Engineering MCP Tool
from mcp.server.fastmcp import FastMCP
mcp = FastMCP("loop-engineering-mcp")

@mcp.tool()
async def execute_agent_loop(prompt: str, max_iterations: int = 5) -> str:
    """Executes a reflective agent loop with self-correction."""
    return f"Loop execution initialized for: {prompt} (max_iterations={max_iterations})"
`,
		mcpConfig: JSON.stringify({
			mcpServers: {
				loop_engineering: {
					command: "python",
					args: ["-m", "loop_engineering_mcp"],
				},
			},
		}),
		traceUrl:
			"https://smith.langchain.com/o/raven-compiler/projects/p/loop-engineering",
		sourceUrl: "https://github.com/cobusgreyling/loop-engineering.git",
		createdAt: new Date().toISOString(),
	},
	{
		id: "bp-1",
		title: "PostgreSQL Database Architect",
		description:
			"Design production-ready database schemas, configure connection pools, and optimize query indexes.",
		content:
			"You are a senior database optimization expert specializing in PostgreSQL and drizzle-orm.",
		tags: ["Postgres", "Database", "Drizzle"],
		authorId: "user_mock",
		upvotes: 12,
		createdAt: new Date().toISOString(),
	},
	{
		id: "bp-2",
		title: "Lead Agent Orchestrator",
		description:
			"Coordinate hierarchical multi-agent teams. Delegate modular filesystem tasks and manage agent memories.",
		content:
			"You are an expert AI agent orchestrator specializing in EVE filesystem-based agent architecture.",
		tags: ["Agent", "Orchestration", "EVE"],
		authorId: "user_mock",
		upvotes: 8,
		createdAt: new Date().toISOString(),
	},
	{
		id: "bp-3",
		title: "Google Genkit Router",
		description:
			"Build robust agent actions, dynamic tool schemas, and multi-model switching flow middleware.",
		content:
			"You are a senior Genkit engineer specializing in Flow-based multi-agent routing.",
		tags: ["Google Genkit", "AI", "Flows"],
		authorId: "user_mock",
		upvotes: 15,
		createdAt: new Date().toISOString(),
	},
];
// biome-ignore lint/suspicious/noExplicitAny: custom fallback
export const inMemoryUsers: any[] = [
	{
		id: "user_mock",
		email: "user@clerk.user",
		firstName: "Mock",
		lastName: "User",
		createdAt: new Date(),
	},
];

// Helper to safely convert Drizzle expression AST objects to string without throwing on circular structures
// biome-ignore lint/suspicious/noExplicitAny: custom query helper
function _extractConditionString(condition: any): string {
	if (!condition) return "";
	if (typeof condition === "string") return condition;
	const seen = new WeakSet();
	try {
		return JSON.stringify(condition, (_key, value) => {
			if (typeof value === "object" && value !== null) {
				if (seen.has(value)) return "[Circular]";
				seen.add(value);
			}
			return value;
		});
	} catch (_e) {
		return String(condition);
	}
}

// Extract column name and value from a Drizzle eq() condition AST.
// Drizzle's eq(column, value) → SQL`${column} = ${value}` stores
// fragments in queryChunks: [Column, " = ", Param].
// biome-ignore lint/suspicious/noExplicitAny: custom query helper
function extractColumnFilter(
	condition: any,
): { column: string; value: any } | null {
	if (!condition) return null;
	const chunks = condition.queryChunks;
	if (!Array.isArray(chunks)) return null;
	let columnName: string | null = null;
	let value: any;
	for (const chunk of chunks) {
		if (chunk && typeof chunk === "object") {
			// Drizzle Column — has name and table/tableName
			if (chunk.name && (chunk.table || chunk.tableName)) {
				columnName = chunk.name;
			}
			// Drizzle Param — has a value property but no name
			if ("value" in chunk && !chunk.name) {
				value = chunk.value;
			}
		}
	}
	if (columnName !== null && value !== undefined) {
		return { column: columnName, value };
	}
	return null;
}

// biome-ignore lint/suspicious/noExplicitAny: cached database client
let cachedDb: any = null;

// biome-ignore lint/suspicious/noExplicitAny: custom lazy-initializer
export function getDb(): any {
	if (cachedDb) return cachedDb;

	const dbUrl =
		typeof process !== "undefined" ? process.env.DATABASE_URL : undefined;
	if (dbUrl) {
		const client = neon(dbUrl);
		cachedDb = drizzle(client, { schema });
		return cachedDb;
	}

	// Dynamic fallback mimicking drizzle query builder API
	cachedDb = {
		// biome-ignore lint/suspicious/noExplicitAny: custom query builder interface
		insert: (table: any) => {
			return {
				// biome-ignore lint/suspicious/noExplicitAny: custom query builder interface
				values: (val: any) => {
					const vals = Array.isArray(val) ? val : [val];
					for (const v of vals) {
						if (table === schema.users) {
							if (!inMemoryUsers.find((u) => u.id === v.id)) {
								inMemoryUsers.push({
									id: v.id,
									email: v.email || `${v.id}@clerk.user`,
									firstName: v.firstName || "Mock",
									lastName: v.lastName || "User",
									createdAt: new Date(),
								});
							}
						} else {
							const newSkill = {
								id: v.id || crypto.randomUUID(),
								title: v.title,
								description: v.description,
								content: v.content,
								tags: v.tags || [],
								authorId: v.authorId || "user_mock",
								upvotes: v.upvotes || 0,
								mcpScript: v.mcpScript || null,
								mcpConfig: v.mcpConfig || null,
								traceUrl: v.traceUrl || null,
								sourceUrl: v.sourceUrl || null,
								createdAt: new Date(),
							};
							inMemorySkills.push(newSkill);
						}
					}
					const resultObj = {
						onConflictDoNothing: () => resultObj,
						// biome-ignore lint/suspicious/noExplicitAny: custom mock chain
						onConflictDoUpdate: (_config: any) => resultObj,
						returning: async () => {
							const last = inMemorySkills[inMemorySkills.length - 1];
							return [{ id: last?.id }];
						},
						// biome-ignore lint/suspicious/noThenProperty: mimicking drizzle query builder
						// biome-ignore lint/suspicious/noExplicitAny: custom resolver
						then: (resolve: any) =>
							Promise.resolve([
								{ id: inMemorySkills[inMemorySkills.length - 1]?.id },
							]).then(resolve),
					};
					return resultObj;
				},
			};
		},
		select: () => {
			return {
				// biome-ignore lint/suspicious/noExplicitAny: custom query builder interface
				from: (table: any) => {
					let list =
						table === schema.skills ? [...inMemorySkills] : [...inMemoryUsers];
					// biome-ignore lint/suspicious/noExplicitAny: custom query builder interface
					const chain: any = {
						orderBy: () => {
							list.sort((a, b) => {
								const tA = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
								const tB = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
								return tB - tA;
							});
							return chain;
						},
						// biome-ignore lint/suspicious/noExplicitAny: custom query builder interface
						where: (condition: any) => {
							const filter = extractColumnFilter(condition);
							if (filter) {
								list = list.filter(
									(item: any) =>
										String(item[filter.column]) === String(filter.value),
								);
							}
							return chain;
						},
						limit: (n: number) => {
							list = list.slice(0, n);
							return chain;
						},
						// biome-ignore lint/suspicious/noThenProperty: mimicking drizzle query builder
						// biome-ignore lint/suspicious/noExplicitAny: custom resolver
						then: (resolve: any) => Promise.resolve(list).then(resolve),
					};
					return chain;
				},
			};
		},
		// biome-ignore lint/suspicious/noExplicitAny: custom query builder interface
		update: (table: any) => {
			return {
				// biome-ignore lint/suspicious/noExplicitAny: custom query builder interface
				set: (values: any) => {
					return {
						// biome-ignore lint/suspicious/noExplicitAny: custom query builder interface
						where: (condition: any) => {
							const filter = extractColumnFilter(condition);
							if (filter && table === schema.skills) {
								const item = inMemorySkills.find(
									(s: any) => String(s[filter.column]) === String(filter.value),
								);
								if (item) {
									for (const [key, val] of Object.entries(values)) {
										if (key === "upvotes" && typeof val === "object") {
											item.upvotes = (item.upvotes || 0) + 1;
										} else if (typeof val !== "object") {
											(item as any)[key] = val;
										}
									}
								}
							}
							return {
								// biome-ignore lint/suspicious/noThenProperty: mimicking drizzle query builder
								// biome-ignore lint/suspicious/noExplicitAny: custom resolver
								then: (resolve: any) =>
									Promise.resolve({ success: true }).then(resolve),
							};
						},
					};
				},
			};
		},
	};

	return cachedDb;
}

export const db = new Proxy(
	{},
	{
		get(_target, prop) {
			return getDb()[prop];
		},
		// biome-ignore lint/suspicious/noExplicitAny: Proxy wrapper for lazy initialization
	},
) as any;
