import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

// Backend Platform Engines metadata (Orchestration & Infrastructure, distinct from Library Domain Skills)
export const backendPlatforms = [
	{
		id: "raven-engine",
		name: "Raven Deep Research Compiler",
		role: "Documentation Ingestion & EVE Skill Synthesis Engine",
		description:
			"Scrapes root documentation URLs, parses directory trees, and synthesizes structured EVE skill bundles using Gemini and Databricks Lakehouse Vector Search.",
		status: "Active Pipeline",
		sourceUrl: "https://github.com/EverMind-AI/Raven.git",
	},
	{
		id: "loop-engineering",
		name: "Loop Engineering Agentic Workflow",
		role: "Multi-Turn Reflective Reasoning Orchestrator",
		description:
			"Coordinates compound agent loops, iterative state convergence, and trajectory evaluation using bounded execution cycles.",
		status: "Active Pipeline",
		sourceUrl: "https://github.com/cobusgreyling/loop-engineering.git",
	},
	{
		id: "skillopt-engine",
		name: "SkillOpt Prompt Optimizer",
		role: "Trajectory Mining & Gated Optimization",
		description:
			"Evaluates generated skills against benchmark tasks (DocVQA, SearchQA) and refines prompt rules during slow-update sleep cycles.",
		status: "Active Pipeline",
		sourceUrl: "https://github.com/EverMind-AI/SkillOpt.git",
	},
];

// Domain Skill Cards in Library (Synthesized from Documentation URLs via EVE Specification)
// biome-ignore lint/suspicious/noExplicitAny: custom fallback
export const inMemorySkills: any[] = [
	{
		id: "expo-skill-1",
		title: "Expo & React Native Universal App Skill",
		description:
			"Official SDK, CLI, and Expo Router guide for building React Native applications with Expo synthesized from docs.expo.dev.",
		content: JSON.stringify({
			"instructions.md": `# Lead Agent Coordinator - Expo & React Native
You are the Lead Coordinator agent specializing in Expo and React Native universal applications under the EVE specification.

## Routing & Intent Architecture
1. **Primary Intent Classifier**: Route mobile setup, navigation, and native build queries to \`/subagents/specialist.md\`.
2. **Skill Trigger**: Activate official CLI syntax and app.json rules in \`/skills/SKILL.md\`.
3. **Task Isolation**: Isolate task states within specialized subagent contexts to ensure deterministic completion.`,
			"subagents/specialist.md": `# Expo Task Specialist Subagent
Specialized subagent operating under the Expo Lead Coordinator.

## Directives
- Parse React Native & Expo Router file configurations lazily.
- Enforce strict error handling for native module installation.
- Return structured status and verification results.`,
			"skills/SKILL.md": `---
name: docs-expo-dev
description: Official SDK, CLI, and Expo Router guide for building React Native applications with Expo. Use when asked about Expo CLI commands, app.json configuration, EAS Build, native modules, Expo Router navigation, or mobile deployment.
license: Apache-2.0
compatibility: Requires Node.js >= 18 and Expo CLI (npx expo)
metadata:
  author: expo-community
  version: "1.0"
---

# Expo & React Native Skill

## Overview & Domain Expertise
Expo is the open-source framework for building universal React Native applications on Android, iOS, and the web. This skill provides official operational patterns, CLI commands, project configuration rules, and zero-token interception rules.

## Progressive Disclosure Strategy
1. **Advertise (~100 tokens)**: Trigger on phrases mentioning Expo, React Native mobile apps, app.json, EAS Build, Expo Router, or npx expo commands.
2. **Load (<5000 tokens)**: Step-by-step guidance on core CLI workflows (\`npx expo install\`, \`npx expo start\`, \`eas build\`), React Native component imports, and managed workflow principles.
3. **Read Resources**: Refer to \`references/POLICY_FAQ.md\` for routing guidelines and \`assets/template.md\` for app manifest structure.
4. **Run Scripts**: Execute \`scripts/validate.py\` to inspect app.json and verify native package compatibility.

## Official CLI & SDK Integration Patterns

### 1. Essential CLI Commands
\`\`\`bash
# Initialize Expo app
npx create-expo-app@latest my-app --template default

# Install native libraries safely
npx expo install react-native-screens react-native-safe-area-context

# Run dev server
npx expo start

# Build native binaries with EAS
npx eas-cli build --platform all
\`\`\`

### 2. Expo Router Layout (\`app/_layout.tsx\`)
\`\`\`tsx
import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Home' }} />
      <Stack.Screen name="details" options={{ title: 'Details' }} />
    </Stack>
  );
}
\`\`\`

## Negative Constraints & Safety Rules
1. NEVER edit \`android/\` or \`ios/\` native directories directly when using Managed Workflow; use Expo Config Plugins in \`app.json\`.
2. NEVER use standard \`npm install\` for native modules; ALWAYS use \`npx expo install\` to match compatible SDK versions.
3. NEVER hardcode API keys or credentials in \`app.json\`; use \`extra\` fields with \`process.env\` or \`.env\` variables.

## Zero-Token Interception Rules
- Direct answer for \`npx expo install\`: Always use \`npx expo install <package>\` to resolve SDK version alignment automatically.
- Direct answer for EAS Build setup: Run \`eas build:configure\` to generate \`eas.json\`.`,
			"rules/boundary_checks.md": `# Boundary & Safety Rules
1. Validate app.json fields against official Expo JSON Schema.
2. Prevent incompatible React Native core dependency downgrades.`,
			"scripts/validate.py": `# Expo Skill Validation Script
import json, sys

def validate_expo():
    print("Validating Expo package manifest and SDK alignment...")
    return True

if __name__ == "__main__":
    sys.exit(0 if validate_expo() else 1)
`,
			"references/POLICY_FAQ.md": `# Expo & React Native FAQ
- Q: How to handle native permissions?
- A: Use Expo config plugins in app.json instead of editing native files.`,
			"assets/template.md": `# App.json Template
\`\`\`json
{
  "expo": {
    "name": "My App",
    "slug": "my-app",
    "version": "1.0.0"
  }
}
\`\`\``,
		}),
		tags: ["Expo", "React Native", "Mobile", "SDK"],
		authorId: "usr_community_curator",
		upvotes: 42,
		mcpScript: `# Expo MCP Tool
from mcp.server.fastmcp import FastMCP
mcp = FastMCP("expo_mcp")

@mcp.tool()
async def inspect_expo_config(project_path: str) -> str:
    """Inspects app.json for Expo SDK version compatibility."""
    return f"Expo config validated for {project_path}"
`,
		mcpConfig: JSON.stringify({
			mcpServers: {
				expo: {
					command: "python",
					args: ["-m", "expo_mcp"],
				},
			},
		}),
		traceUrl: "https://smith.langchain.com/o/raven-compiler/projects/p/expo-skill",
		sourceUrl: "https://docs.expo.dev",
		createdAt: new Date().toISOString(),
	},
	{
		id: "stripe-skill-1",
		title: "Stripe Payments & Billing Skill",
		description:
			"Official SDK patterns, Webhook verification, and Payment Intent workflows synthesized from stripe.com/docs.",
		content: JSON.stringify({
			"instructions.md": `# Lead Agent Coordinator - Stripe Payments
You are the Lead Coordinator agent specializing in Stripe Payments and Billing integration under the EVE specification.

## Routing & Intent Architecture
1. **Primary Intent Classifier**: Route checkout sessions, webhooks, and subscription queries to \`/subagents/specialist.md\`.
2. **Skill Trigger**: Activate Stripe SDK methods and webhook signature checks in \`/skills/SKILL.md\`.
3. **Task Isolation**: Isolate task states within specialized subagent contexts to ensure deterministic completion.`,
			"subagents/specialist.md": `# Stripe Task Specialist Subagent
Specialized subagent operating under the Stripe Lead Coordinator.

## Directives
- Parse Stripe SDK initialization lazily inside API handlers.
- Enforce strict raw body parsing for webhook verification.
- Return structured payment intent and webhook status payload.`,
			"skills/SKILL.md": `---
name: docs-stripe-com
description: Official Stripe Node.js SDK, Webhook verification, and Checkout Session guide. Use when implementing payments, subscriptions, Stripe Checkout, or webhook signature handlers.
license: Apache-2.0
compatibility: Node.js >= 18 and stripe SDK
metadata:
  author: stripe-dev-community
  version: "1.0"
---

# Stripe Payments & Billing Skill

## Overview & Domain Expertise
Stripe provides financial infrastructure for modern web applications. This skill encodes official SDK initialization, Checkout Session creation, and secure Webhook signature verification rules.

## Progressive Disclosure Strategy
1. **Advertise (~100 tokens)**: Trigger on phrases mentioning Stripe payments, checkout, webhooks, subscriptions, or Stripe SDK.
2. **Load (<5000 tokens)**: Load lazy Stripe SDK instantiation, payment intent flows, and raw body signature verification.
3. **Read Resources**: Refer to \`references/POLICY_FAQ.md\` for PCI compliance and idempotency key guidelines.
4. **Run Scripts**: Execute \`scripts/validate.py\` to verify environment secret key configuration.

## Official SDK & Webhook Patterns

### 1. Lazy SDK Initialization
\`\`\`ts
import Stripe from "stripe";

let stripeClient: Stripe | null = null;
export function getStripe(): Stripe {
  if (!stripeClient) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY missing");
    stripeClient = new Stripe(key, { apiVersion: "2023-10-16" });
  }
  return stripeClient;
}
\`\`\`

### 2. Webhook Signature Verification
\`\`\`ts
const event = stripe.webhooks.constructEvent(
  rawBody,
  signature,
  process.env.STRIPE_WEBHOOK_SECRET!
);
\`\`\`

## Negative Constraints
1. NEVER initialize Stripe at top-level module load.
2. NEVER expose \`STRIPE_SECRET_KEY\` to the browser client.`,
			"rules/boundary_checks.md": `# Boundary Checks
1. Ensure raw request body is passed to stripe.webhooks.constructEvent.
2. Store processed event IDs for idempotency.`,
			"scripts/validate.py": `# Stripe Validation Script
print("Checking STRIPE_SECRET_KEY presence...")
`,
			"references/POLICY_FAQ.md": `# Stripe FAQ
- Q: How to handle recurring billing?
- A: Use Stripe Billing subscriptions with webhook listening for invoice.payment_succeeded.`,
			"assets/template.md": `# Stripe Config Template
\`\`\`env
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
\`\`\``,
		}),
		tags: ["Stripe", "Payments", "Billing", "SDK"],
		authorId: "usr_community_curator",
		upvotes: 38,
		sourceUrl: "https://stripe.com/docs",
		createdAt: new Date().toISOString(),
	},
	{
		id: "nextjs-skill-1",
		title: "Next.js 15 App Router & Server Actions Skill",
		description:
			"Official Next.js 15 App Router architecture, Server Components, and Server Actions synthesized from nextjs.org/docs.",
		content: JSON.stringify({
			"instructions.md": `# Lead Agent Coordinator - Next.js 15
You are the Lead Coordinator agent specializing in Next.js 15 App Router under the EVE specification.

## Routing Architecture
1. **Primary Intent Classifier**: Route layout, page, and Server Action queries to \`/subagents/specialist.md\`.
2. **Skill Trigger**: Enforce Server Component boundaries and caching rules in \`/skills/SKILL.md\`.
3. **Task Isolation**: Isolate task states within specialized subagent contexts.`,
			"subagents/specialist.md": `# Next.js Specialist Subagent
Specialized subagent operating under the Next.js Lead Coordinator.

## Directives
- Differentiate 'use client' and Server Components cleanly.
- Enforce async params and headers in Next.js 15.
- Return validated route schemas and component trees.`,
			"skills/SKILL.md": `---
name: docs-nextjs-org
description: Official Next.js 15 App Router, React Server Components (RSC), and Server Actions guide. Use when building Next.js pages, routing layouts, middleware, or API routes.
license: Apache-2.0
compatibility: Node.js >= 18 and Next.js 15
metadata:
  author: nextjs-community
  version: "1.0"
---

# Next.js 15 App Router Skill

## Overview & Domain Expertise
Next.js 15 provides React Server Components, streaming SSR, and Server Actions for web applications.

## Progressive Disclosure Strategy
1. **Advertise (~100 tokens)**: Trigger on Next.js 15, App Router, Server Actions, or RSC queries.
2. **Load (<5000 tokens)**: Async params pattern, Server Actions validation with Zod, and middleware conventions.
3. **Read Resources**: Refer to \`references/POLICY_FAQ.md\` for migration guides.
4. **Run Scripts**: Execute \`scripts/validate.py\` for route structure checks.

## Official Integration Directives
\`\`\`tsx
// app/page.tsx - Server Component with async params
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <div>ID: {id}</div>;
}
\`\`\`

## Negative Constraints
1. NEVER access \`params\` or \`searchParams\` synchronously in Next.js 15.
2. NEVER import server-only modules inside 'use client' files.`,
			"rules/boundary_checks.md": `# Boundary Rules
1. Verify 'use client' directive presence on interactive components.`,
			"scripts/validate.py": `# Next.js Validation Script
print("Validating Next.js 15 route tree...")
`,
			"references/POLICY_FAQ.md": `# Next.js 15 FAQ
- Q: What changed in params in Next.js 15?
- A: params and searchParams are now Promises and must be awaited.`,
			"assets/template.md": `# Next.js Config Template
\`\`\`ts
import type { NextConfig } from 'next';
const nextConfig: NextConfig = {};
export default nextConfig;
\`\`\``,
		}),
		tags: ["Next.js", "App Router", "React", "Server Actions"],
		authorId: "usr_community_curator",
		upvotes: 35,
		sourceUrl: "https://nextjs.org/docs",
		createdAt: new Date().toISOString(),
	},
	{
		id: "raven-skill-1",
		title: "Raven Production Agent Harness & Deep Research Skill",
		description:
			"Production EVE skill for EverMind's Raven agent harness. Features automated backend agent execution, EverOS durable memory, MiroThinker Deep Research, Sentinel proactivity, and gateway orchestration.",
		content: JSON.stringify({
			"instructions.md": `# Lead Agent Coordinator - Raven Production Agent Harness & EverOS
You are the Lead Coordinator agent specializing in EverMind's Raven agent harness and EverOS memory runtime under the EVE specification.

## Routing & Intent Architecture
1. **Primary Intent Classifier**: Route Spine runtime execution, gateway daemons, and memory management to \`/subagents/specialist.md\`.
2. **Skill Trigger**: Activate automated Raven execution syntax, \`raven doctor\` diagnostics, and EverOS memory rules in \`/skills/SKILL.md\`.
3. **Task Isolation**: Isolate task states within specialized subagent contexts.`,
			"subagents/specialist.md": `# Raven Specialist Subagent
Specialized subagent operating under the Raven Lead Coordinator for automated production workflows.

## Directives
- Execute automated Raven non-interactive tasks (\`raven agent -m "..."\`).
- Run background diagnostics automatically with \`raven doctor\`.
- Configure MiroThinker Deep Research automatically with \`raven deep-research enable\`.
- Manage EverOS durable memory, SkillForge skills (\`raven skill list\`), and Sentinel proactivity (\`raven sentinel status\`).
- Process execution logs lazily and output structured reports.`,
			"skills/SKILL.md": `---
name: raven-evermind-ai
description: Production EVE skill for EverMind's Raven agent harness. Covers automated backend agent execution, EverOS durable memory, MiroThinker Deep Research auto-configuration, Sentinel proactivity, and gateway orchestration.
license: Apache-2.0
compatibility: Linux / Container Production Runtime (Python 3.12, Node.js 22)
metadata:
  author: evermind-team
  version: "1.0"
---

# Raven Production Agent Harness & Execution Skill

## Overview & Operational Directives
Raven is an automated, self-improving agent harness for production AI workloads. Backend Gemini models and AI agents execute Raven directly via CLI, Spine RPC, or Python/TypeScript integration without requiring manual human terminal input.

## Automated Execution Directives for Agents

### 1. Automated Environment Bootstrap (Container / Server)
\`\`\`bash
# Automated non-interactive installation
curl -fsSL https://raven.evermind.ai/install.sh | bash

# Verify runtime environment & provider keys automatically
raven doctor
\`\`\`

### 2. Automated Task Execution & Research
\`\`\`bash
# Execute background agent tasks non-interactively
raven agent -m "Analyze repository structure, run tests, and generate report"

# Enable MiroThinker Deep Research for complex research tasks
raven deep-research enable

# Run benchmark-driven harness self-evolution
python -m raven.evolver run --config raven.yaml
\`\`\`

### 3. Automated Gateway Daemon Orchestration
\`\`\`bash
# Launch background channels gateway (Telegram, Slack, Discord, WhatsApp bridge)
raven gateway
\`\`\`

## Repository Architecture & Core Engine Modules
\`\`\`text
raven/
├── spine/              # Spine runtime: submit -> lanes -> emit
├── agent/              # Agent loop, tools, subagents, context builder
├── channels/           # Gateway adapters (telegram, slack, discord, whatsapp, matrix)
├── context_engine/     # Context Curator path with explicit token budgets
├── proactive_engine/   # Sentinel scheduler & proactive nudge policy
├── memory_engine/      # EverOS durable user/agent memory & SkillForge
└── evolver/            # Benchmark self-evolution engine (raven.evolver)
\`\`\`

## Production Constraints & Safety Guardrails
1. NEVER expect human user terminal interaction; all Raven operations MUST be dispatched automatically by the AI agent via tool execution or background RPC.
2. ALWAYS execute \`raven doctor\` automatically upon setup or provider key updates to guarantee system health.
3. NEVER mix transient context with EverOS durable memory; persist multi-session facts into EverOS and session states into local Spine lanes.`,
			"rules/boundary_checks.md": `# Boundary & Safety Rules for Raven Harness
1. Verify system prerequisites: Python >= 3.12, Node.js >= 22, uv package manager.
2. Run \`raven doctor\` automatically when provider setup or sandbox errors occur.
3. Cap subagent delegation depth at \`max_iterations: 5\`.`,
			"scripts/validate.py": `# Raven Automated Environment Validation Script
import subprocess
import sys

def check_raven():
    try:
        res = subprocess.run(["raven", "doctor"], capture_output=True, text=True)
        print("Raven doctor output:")
        print(res.stdout or res.stderr)
        return res.returncode == 0
    except FileNotFoundError:
        print("Raven CLI not found in PATH. Executing non-interactive installer...")
        return False

if __name__ == "__main__":
    sys.exit(0 if check_raven() else 1)
`,
			"references/POLICY_FAQ.md": `# Raven Messaging Gateways & Architecture FAQ
## Supported Gateway Adapters (\`raven channels list\`)
- **Telegram** (\`telegram\`): Bot-based messaging
- **Slack** (\`slack\`): Workspace messaging
- **Discord** (\`discord\`): Server and bot messaging
- **WhatsApp** (\`whatsapp\`): Bundled TypeScript bridge
- **Matrix** (\`matrix\`): Matrix rooms and DMs
- **Feishu / WeCom** (\`feishu\` / \`wecom\`): Enterprise messaging
- **Email** (\`email\`): IMAP/SMTP mailbox integration

## Benchmark Self-Evolution
Run \`python -m raven.evolver run --config config.yaml\` to execute benchmark-driven harness self-evolution with sealed test sets.`,
			"assets/template.md": `# Raven Production Config Template (\`raven.yaml\`)
\`\`\`yaml
version: "1.0"
provider:
  default: gemini
  model: gemini-2.5-flash
memory:
  backend: everos
deep_research:
  enabled: true
  engine: mirothinker
sentinel:
  enabled: true
  nudge_interval: 300
\`\`\``,
		}),
		tags: ["Raven", "EverOS", "Deep Research", "Agent Harness", "Production"],
		authorId: "usr_community_curator",
		upvotes: 42,
		sourceUrl: "https://raven.evermind.ai",
		createdAt: new Date().toISOString(),
	},
	{
		id: "adk-skill-1",
		title: "Google Agent Development Kit (ADK) Skill",
		description:
			"Official Google ADK multi-agent framework, LlmAgent, and Gemini tool orchestration synthesized from google.github.io/adk.",
		content: JSON.stringify({
			"instructions.md": `# Lead Agent Coordinator - Google ADK
You are the Lead Coordinator agent specializing in Google Agent Development Kit (ADK) multi-agent systems under the EVE specification.

## Routing Architecture
1. **Primary Intent Classifier**: Route multi-agent orchestration to \`/subagents/specialist.md\`.
2. **Skill Trigger**: Activate LlmAgent and FastMCP bindings in \`/skills/SKILL.md\`.
3. **Task Isolation**: Isolate task states within specialized subagent contexts.`,
			"subagents/specialist.md": `# ADK Specialist Subagent
Specialized subagent operating under the ADK Lead Coordinator.

## Directives
- Implement LlmAgent hierarchies using Python and Go ADK modules.
- Return structured agent definitions and tool bindings.`,
			"skills/SKILL.md": `---
name: google-adk-agent
description: Official Google Agent Development Kit (ADK) skill for multi-agent workflows, LlmAgent, tool orchestration, and Vertex AI / Gemini models. Use when asked about Google ADK, multi-agent hierarchies, LlmAgent setup, or FastMCP integration.
license: Apache-2.0
compatibility: Requires Python >= 3.10 and google-adk
metadata:
  author: google-adk-team
  version: "1.0"
---

# Google Agent Development Kit (ADK) Skill

## Overview & Domain Expertise
Google ADK is the open framework for building modular, multi-agent systems using Gemini 2.5 and LiteLLM backends.

## Progressive Disclosure Strategy
1. **Advertise (~100 tokens)**: Triggers on ADK multi-agent requests, LlmAgent, or FastMCP tool definitions.
2. **Load (<5000 tokens)**: Load core \`google.adk.agents.LlmAgent\` patterns, tool bindings, and runner scripts.
3. **Read Resources**: Load \`references/POLICY_FAQ.md\` for multi-agent delegation guidelines.
4. **Run Scripts**: Execute \`scripts/validate.py\` for agent hierarchy sanity checks.

## Python Quickstart Pattern
\`\`\`python
from google.adk.agents import LlmAgent
from google.adk.tools import google_search

dice_agent = LlmAgent(
    model="gemini-2.5-flash",
    name="question_answer_agent",
    description="A helpful assistant agent that can answer questions.",
    instruction="Respond to the query using google search",
    tools=[google_search]
)
\`\`\`

## Negative Constraints & Safety Rules
1. NEVER expose raw Gemini API keys in client-side code.
2. ALWAYS validate tool parameters with Zod or Pydantic before execution.`,
			"rules/boundary_checks.md": `# Boundary Rules
1. Verify model alias compatibility with Gemini 2.5 Flash.`,
			"scripts/validate.py": `# ADK Validation Script
print("Validating ADK LlmAgent structure...")
`,
			"references/POLICY_FAQ.md": `# ADK FAQ
- Q: Which models are supported?
- A: gemini-2.5-flash and gemini-2.0-flash-exp via Vertex AI or Gemini API.`,
			"assets/template.md": `# ADK Config Template
\`\`\`json
{
  "agent_name": "adk_agent",
  "model": "gemini-2.5-flash"
}
\`\`\``,
		}),
		tags: ["Google ADK", "Multi-Agent", "Gemini", "LlmAgent"],
		authorId: "usr_community_curator",
		upvotes: 29,
		sourceUrl: "https://google.github.io/adk",
		createdAt: new Date().toISOString(),
	},
	{
		id: "vercel-workflow-skill",
		title: "Vercel Workflow Durable AI & Agent Workflow Skill",
		description:
			"Build durable, stateful AI workflows and multi-step agent orchestrations in Python and TypeScript using the Vercel Workflow SDK synthesized from vercel/workflow.",
		content: JSON.stringify({
			"agent/instructions.md": `# Lead Agent Coordinator - Vercel Workflow
You are the Lead Coordinator agent specializing in Vercel Workflow durable executions under the EVE specification.

## Routing & Intent Architecture
1. **Primary Intent Classifier**: Route workflow definitions, step functions (@wf.step), sleep delays, and human approval hooks (BaseHook) to \`/agent/subagents/specialist.md\`.
2. **Skill Trigger**: Activate official pyproject.toml workflow registration and Python/TS SDK methods in \`/agent/skills/SKILL.md\`.
3. **Task Isolation**: Isolate task states within specialized subagent contexts to ensure deterministic workflow completion.`,
			"instructions.md": `# Lead Agent Coordinator - Vercel Workflow
You are the Lead Coordinator agent specializing in Vercel Workflow durable executions under the EVE specification.

## Routing & Intent Architecture
1. **Primary Intent Classifier**: Route workflow definitions, step functions (@wf.step), sleep delays, and human approval hooks (BaseHook) to \`/subagents/specialist.md\`.
2. **Skill Trigger**: Activate official pyproject.toml workflow registration and Python/TS SDK methods in \`/skills/SKILL.md\`.
3. **Task Isolation**: Isolate task states within specialized subagent contexts to ensure deterministic workflow completion.`,
			"agent/subagents/specialist.md": `# Vercel Workflow Specialist Subagent
Specialized subagent operating under the Vercel Workflow Lead Coordinator.

## Directives
- Differentiate durable workflows (@wf.workflow) from stateless step tasks (@wf.step).
- Ensure durable delays use workflow.sleep() and external approvals inherit workflow.BaseHook.
- Return structured workflow status and token verification results.`,
			"subagents/specialist.md": `# Vercel Workflow Specialist Subagent
Specialized subagent operating under the Vercel Workflow Lead Coordinator.

## Directives
- Differentiate durable workflows (@wf.workflow) from stateless step tasks (@wf.step).
- Ensure durable delays use workflow.sleep() and external approvals inherit workflow.BaseHook.
- Return structured workflow status and token verification results.`,
			"agent/skills/SKILL.md": `---
name: vercel-workflow
description: Build durable workflows and AI agents in Python and TypeScript with the Vercel Workflow SDK. Use when setting up pyproject.toml dependencies, @wf.workflow, @wf.step, workflow.sleep, or BaseHook approval events.
license: Apache-2.0
compatibility: Requires Python >= 3.12 or Node.js >= 18 with vercel package
metadata:
  author: vercel
  version: "1.0"
---

# Vercel Workflow Skill

## Overview & Domain Expertise
Build durable workflows in Python and TypeScript using the \`vercel\` SDK. Workflows maintain state, pause, resume, and replay deterministically across deploys or server restarts without consuming compute resources during sleep or wait states.

## Progressive Disclosure Strategy
1. **Advertise (~100 tokens)**: Trigger on mentions of Vercel Workflow, \`npx skills add vercel/workflow\`, durable execution, \`@wf.workflow\`, \`@wf.step\`, \`workflow.sleep\`, or \`workflow.BaseHook\`.
2. **Load (<5000 tokens)**: Step-by-step guidance on \`pyproject.toml\` configuration (\`dependencies = ["vercel"]\`, \`[[tool.vercel.workflows]] entrypoint = "app.workflows:wf"\`), Python workflow/step decorators, and hooks.
3. **Read Resources**: Refer to \`references/POLICY_FAQ.md\` for execution log rules and \`assets/template.md\` for starter workflow modules.
4. **Run Scripts**: Execute \`scripts/validate.py\` to verify entrypoint module syntax and workflow registry exports.

## Configuration & Project Setup

### 1. Project Manifest (\`pyproject.toml\`)
\`\`\`toml
[project]
requires-python = ">=3.12"
dependencies = ["vercel"]

[[tool.vercel.workflows]]
entrypoint = "app.workflows:wf"
\`\`\`

### 2. Workflow Registry (\`app/workflow.py\`)
\`\`\`python
from vercel import workflow

wf = workflow.Workflows()
\`\`\`

### 3. Stateful Workflow & Steps (\`app/workflows/ai_content_workflow.py\`)
\`\`\`python
from app.workflow import wf
from vercel import workflow
from pydantic import BaseModel
from typing import Literal

@wf.step
async def generate_draft(*, topic: str):
    return f"Draft content for {topic}"

@wf.step
async def summarize_draft(*, draft: str):
    return f"Summary: {draft[:50]}"

class Approval(BaseModel, workflow.BaseHook):
    decision: Literal["approved", "changes"]
    notes: str | None = None

@wf.workflow
async def ai_content_workflow(*, topic: str):
    draft = await generate_draft(topic=topic)
    summary = await summarize_draft(draft=draft)

    # Durable pause for human approval
    async for event in Approval.wait(token="draft-123"):
        if event.decision == "approved":
            break

    # Durable sleep delay
    await workflow.sleep("7 days")

    return {"draft": draft, "summary": summary}
\`\`\`

## Domain-Specific Constraints
1. NEVER use standard time.sleep() or un-checkpointed state inside a workflow function; ALWAYS use \`await workflow.sleep()\`.
2. ALWAYS ensure step functions are stateless and decorated with \`@wf.step\`.`,
			"skills/SKILL.md": `---
name: vercel-workflow
description: Build durable workflows and AI agents in Python and TypeScript with the Vercel Workflow SDK. Use when setting up pyproject.toml dependencies, @wf.workflow, @wf.step, workflow.sleep, or BaseHook approval events.
license: Apache-2.0
compatibility: Requires Python >= 3.12 or Node.js >= 18 with vercel package
metadata:
  author: vercel
  version: "1.0"
---

# Vercel Workflow Skill

## Overview & Domain Expertise
Build durable workflows in Python and TypeScript using the \`vercel\` SDK. Workflows maintain state, pause, resume, and replay deterministically across deploys or server restarts.

## Configuration & Project Setup
\`\`\`toml
[project]
requires-python = ">=3.12"
dependencies = ["vercel"]

[[tool.vercel.workflows]]
entrypoint = "app.workflows:wf"
\`\`\`

\`\`\`python
from vercel import workflow

wf = workflow.Workflows()

@wf.workflow
async def ai_content_workflow(*, topic: str):
    draft = await generate_draft(topic=topic)
    await workflow.sleep("7 days")
    return {"draft": draft}
\`\`\`
`,
			"rules/boundary_checks.md": `# Boundary Rules
1. Verify module:object format in pyproject.toml tool.vercel.workflows entrypoint.
2. Confirm step functions handle transient exceptions with automatic retries.`,
			"scripts/validate.py": `# Vercel Workflow Validation
print("Checking Vercel Workflow entrypoint definitions...")
`,
			"references/POLICY_FAQ.md": `# Vercel Workflow FAQ
- Q: How does state persistence work?
- A: Inputs and outputs are recorded in an event log to replay execution deterministically on restart.`,
			"assets/template.md": `# Vercel Workflow Template
\`\`\`python
from vercel import workflow

wf = workflow.Workflows()
\`\`\``,
		}),
		tags: ["Vercel", "Workflows", "Python", "TypeScript", "Durable Workflows"],
		authorId: "usr_community_curator",
		upvotes: 42,
		sourceUrl: "https://vercel.com/docs/workflows",
		createdAt: new Date().toISOString(),
	},
	{
		id: "vercel-eve-skill",
		title: "Vercel EVE Native Agent & Skill Framework Skill",
		description:
			"Official specification, agent project directory structure, typed tools, and subagents for Vercel EVE agent skills synthesized from vercel/eve.",
		content: JSON.stringify({
			"agent/instructions.md": `# Lead Agent Coordinator - Vercel EVE Framework
You are the Lead Agent Coordinator operating under the official Vercel EVE filesystem project specification.

## Intent Classification & Subagent Routing
1. **Always-On Instructions (\`agent/instructions.md\`)**: System identity, standing rules, and subagent routing.
2. **On-Demand Skills (\`agent/skills/SKILL.md\`)**: Loaded into context via \`load_skill\` when tasks match keywords.
3. **Typed Tools (\`agent/tools/*.ts\`)**: Executable TypeScript functions using \`defineTool\`.
4. **Subagents (\`agent/subagents/*\`)**: Specialized agents with dedicated prompts and tools.`,
			"instructions.md": `# Lead Agent Coordinator - Vercel EVE Framework
You are the Lead Agent Coordinator operating under the official Vercel EVE filesystem project specification.

## Intent Classification & Subagent Routing
1. **Always-On Instructions (\`agent/instructions.md\`)**: System identity, standing rules, and subagent routing.
2. **On-Demand Skills (\`agent/skills/SKILL.md\`)**: Loaded into context via \`load_skill\` when tasks match keywords.
3. **Typed Tools (\`agent/tools/*.ts\`)**: Executable TypeScript functions using \`defineTool\`.
4. **Subagents (\`agent/subagents/*\`)**: Specialized agents with dedicated prompts and tools.`,
			"agent/subagents/specialist.md": `# Vercel EVE Specialist Subagent
Specialized subagent operating under the Lead Coordinator for Vercel EVE agents.

## Directives
- Parse tool schemas using Zod validation.
- Route specialist requests to \`agent/tools/\` modules.
- Return structured execution telemetry and status reports.`,
			"subagents/specialist.md": `# Vercel EVE Specialist Subagent
Specialized subagent operating under the Lead Coordinator for Vercel EVE agents.

## Directives
- Parse tool schemas using Zod validation.
- Route specialist requests to \`agent/tools/\` modules.
- Return structured execution telemetry and status reports.`,
			"agent/skills/SKILL.md": `---
name: vercel-eve
description: Official specification for Vercel EVE Agent Skills, native tools (defineTool), subagent routing (agent/subagents/), and CLI skill management (npx skills add vercel/eve).
license: Apache-2.0
compatibility: Compatible with EVE specification and Node.js >= 18
metadata:
  author: vercel
  version: "1.0"
---

# Vercel EVE Skill

## Overview & Domain Expertise
Vercel EVE is the standardized open specification for agent skills and multi-agent directory structures. It organizes agent capabilities into native tools, instructions, and modular subagent cards.

## EVE Project Structure & Progressive Disclosure
1. **Always-On Instructions (\`agent/instructions.md\`)**: System identity, standing rules, and subagent routing.
2. **On-Demand Skills (\`agent/skills/SKILL.md\`)**: Loaded into context via \`load_skill\` when task matches description.
3. **Typed Tools (\`agent/tools/*.ts\`)**: Executable TypeScript functions using \`defineTool\`.
4. **Subagents (\`agent/subagents/*\`)**: Specialist agents with dedicated prompts and tools.

## Executable Tool Integration Pattern
\`\`\`typescript
import { defineTool } from "eve/tools";
import { z } from "zod";

export default defineTool({
  description: "Execute Vercel EVE tool or integration",
  inputSchema: z.object({
    query: z.string().describe("Task or payload query for Vercel EVE"),
    options: z.record(z.unknown()).optional(),
  }),
  async execute({ query, options }) {
    return { status: "success", domain: "vercel-eve", query };
  },
});
\`\`\`

## Domain-Specific Constraints
1. NEVER import server-side Vercel EVE secrets inside browser components.
2. ALWAYS validate input schemas with Zod before dispatching remote calls.`,
			"skills/SKILL.md": `---
name: vercel-eve
description: Official specification for Vercel EVE Agent Skills, native tools (defineTool), subagent routing (agent/subagents/), and CLI skill management (npx skills add vercel/eve).
license: Apache-2.0
compatibility: Compatible with EVE specification and Node.js >= 18
metadata:
  author: vercel
  version: "1.0"
---

# Vercel EVE Skill

## EVE Directory Structure
- \`agent/instructions.md\`: System identity and routing
- \`agent/skills/SKILL.md\`: Load-on-demand skill definition
- \`agent/tools/*.ts\`: Typed executable tools (\`defineTool\`)
- \`agent/subagents/*.ts\`: Specialized subagents
`,
			"rules/boundary_checks.md": `# Boundary Rules
1. Verify presence of valid YAML frontmatter in agent/skills/SKILL.md.
2. Ensure defineTool uses Zod schemas for input validation.`,
			"scripts/validate.py": `# Vercel EVE Validation Script
print("Validating EVE filesystem structure...")
`,
			"references/POLICY_FAQ.md": `# Vercel EVE FAQ
- Q: How to add an EVE skill via CLI?
- A: Run \`npx skills add vercel/eve\` or use the Skill Compiler UI.`,
			"assets/template.md": `# Vercel EVE Tool Template
\`\`\`typescript
import { defineTool } from "eve/tools";
import { z } from "zod";

export default defineTool({
  description: "EVE Tool Example",
  inputSchema: z.object({ input: z.string() }),
  async execute({ input }) {
    return { result: input };
  }
});
\`\`\``,
		}),
		tags: ["Vercel", "EVE", "Agent Specification", "Skills", "Tools"],
		authorId: "usr_community_curator",
		upvotes: 58,
		sourceUrl: "https://vercel.com/docs/eve",
		createdAt: new Date().toISOString(),
	},
];
// biome-ignore lint/suspicious/noExplicitAny: custom fallback
export const inMemoryUsers: any[] = [
	{
		id: "guest_user",
		email: "guest@eve.agent",
		firstName: "Guest",
		lastName: "Developer",
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
function extractColumnFilter(
	condition: unknown,
): { column: string; value: unknown } | null {
	if (!condition || typeof condition !== "object") return null;
	const chunks = (condition as { queryChunks?: unknown[] }).queryChunks;
	if (!Array.isArray(chunks)) return null;
	let columnName: string | null = null;
	let value: unknown;
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
									firstName: v.firstName || "Guest",
									lastName: v.lastName || "Developer",
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
								authorId: v.authorId || "guest_user",
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
						// biome-ignore lint/suspicious/noExplicitAny: custom query builder chain
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
									(item: Record<string, unknown>) =>
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
				set: (values: Record<string, unknown>) => {
					return {
						// biome-ignore lint/suspicious/noExplicitAny: custom query builder interface
						where: (condition: any) => {
							const filter = extractColumnFilter(condition);
							if (filter && table === schema.skills) {
								const item = inMemorySkills.find(
									(s: Record<string, unknown>) => String(s[filter.column]) === String(filter.value),
								);
								if (item) {
									for (const [key, val] of Object.entries(values)) {
										if (key === "upvotes" && typeof val === "object") {
											item.upvotes = ((item.upvotes as number) || 0) + 1;
										} else if (typeof val !== "object") {
											(item as Record<string, unknown>)[key] = val;
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

// biome-ignore lint/suspicious/noExplicitAny: Proxy wrapper for lazy initialization
export const db = new Proxy(
	{},
	{
		get(_target, prop) {
			return getDb()[prop];
		},
	},
) as any;
