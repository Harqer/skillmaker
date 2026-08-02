import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { BlueprintCard } from "@/features/skills/components/molecules/BlueprintCard";
import { SkillCompilerForm } from "@/features/skills/components/organisms/SkillCompilerForm";
import { SkillsLibraryGrid } from "@/features/skills/components/organisms/SkillsLibraryGrid";
import { useSkills } from "@/features/skills/hooks/useSkills";
import { getSkills } from "@/server/skills";
import { useAuth } from "../components/auth/ClerkHelpers";

export const Route = createFileRoute("/")({
	head: () => ({
		meta: [
			{ title: "Raven - Production AI Agent Skills" },
			{
				name: "description",
				content:
					"Discover, share, and deploy specialized skills for your autonomous AI agents.",
			},
		],
	}),
	loader: async () => {
		try {
			const trending = await getSkills({ data: undefined });
			return {
				trendingSkills: trending || [],
			};
		} catch (e) {
			console.error("Index route loader error:", e);
			return {
				trendingSkills: [],
			};
		}
	},
	component: Home,
});

const BLUEPRINTS = [
	{
		title: "PostgreSQL Database Architect",
		description:
			"Design production-ready database schemas, configure connection pools, and optimize query indexes.",
		content:
			"You are a senior database optimization expert specializing in PostgreSQL and drizzle-orm.\n\nYour mandate is to guide the user to write highly scalable SQL schemas, optimized indexes, and connection handlers. Always follow these best practices:\n1. Connection Management: Use connection pool clients in serverless or containerized environments. Cache the connection pool globally so that multiple warm invokes can reuse the client.\n2. Lazy Initialization: Do not instantiate database connections at module load. Initialize them lazily inside handlers.\n3. Query Optimization: Prefer explicit select fields instead of full table scans (e.g. `select({ id, name })`). Always generate appropriate indexes on foreign key relations and common query filters.\n4. Transaction Safety: Design atomic transactions using drizzle-orm with strict error boundaries, ensuring that failed multi-table operations are rolled back completely.",
		tags: ["Postgres", "Database", "Drizzle"],
	},
	{
		title: "Lead Agent Orchestrator",
		description:
			"Coordinate hierarchical multi-agent teams. Delegate modular filesystem tasks and manage agent memories.",
		content:
			"You are an expert AI agent orchestrator specializing in EVE filesystem-based agent architecture.\n\nYour goal is to guide developers in designing collaborative multi-agent workspaces:\n1. Clean Hierarchy: Define a primary 'Lead' agent in instructions.md to route user intents, parse tasks, and handle user interaction. Delegate specialized tasks to independent subagents housed under the `/subagents` directory.\n2. Autonomous Delegation: Allow the lead agent to trigger subagents automatically based on context rather than writing rigid, hardcoded routing paths.\n3. State & Context Isolation: Keep instructions.md for subagents extremely focused (less than 150 lines). Prevent loop conditions where subagents repeatedly delegate to one another without progress by establishing clear task completion exit criteria.",
		tags: ["Agent", "Orchestration", "EVE"],
	},
	{
		title: "Google Genkit Router",
		description:
			"Build robust agent actions, dynamic tool schemas, and multi-model switching flow middleware.",
		content:
			"You are a senior Genkit engineer specializing in Flow-based multi-agent routing.\n\nYour mission is to guide developers through constructing robust agent pipelines using Genkit:\n1. Explicit Schema: Always define strict input and output contracts for independent agent actions using Zod schemas.\n2. Middleware Pipeline: Use Genkit middleware for cross-agent validation, logging, and security checks. Never pass unvetted user inputs directly to tools.\n3. Dynamic Tool Injection: Treat agent actions as modular tool objects, allowing the central router model to select them on-demand. Support multi-model orchestration, switching models dynamically depending on complexity (e.g. Gemini 2.5 Flash for speed, Gemini 1.5 Pro for deep analysis).",
		tags: ["Google Genkit", "AI", "Flows"],
	},
];

function Home() {
	const { trendingSkills } = Route.useLoaderData();
	const navigate = useNavigate();

	const { seed, seedingBlueprint } = useSkills();
	const { userId, isLoaded } = useAuth();

	const currentUserId = isLoaded && userId ? userId : "guest_user";

	const mySkills = trendingSkills.filter(
		(s: { authorId: string }) => s.authorId === currentUserId,
	);
	const communitySkills = trendingSkills.filter(
		(s: { authorId: string }) => s.authorId !== currentUserId,
	);

	const handleInstantPublish = async (blueprint: (typeof BLUEPRINTS)[0]) => {
		await seed(blueprint);
	};

	const handleCustomize = (blueprint: (typeof BLUEPRINTS)[0]) => {
		try {
			localStorage.setItem("pendingGeneratedSkill", JSON.stringify(blueprint));
		} catch (e) {
			console.error("Failed to write blueprint to localStorage:", e);
		}
		navigate({ to: "/submit" });
	};

	return (
		<div className="container py-16 max-w-5xl mx-auto space-y-16 animate-in fade-in duration-500 flex flex-col items-center">
			{/* Hero Headings */}
			<div className="flex flex-col items-center text-center gap-6 max-w-3xl mx-auto">
				<h1 className="text-5xl sm:text-6xl font-serif text-foreground leading-[1.1] tracking-tight">
					Craft AI skills.
					<br />
					<span className="text-primary italic">Benchmark</span> them like
					prose.
				</h1>
				<p className="text-lg text-muted-foreground leading-relaxed max-w-2xl font-medium mx-auto">
					Turn any API documentation URL into a highly optimized agentic skill
					card, bootstrap structured multi-agent workflows, and run interactive
					benchmarks measuring precision and cost.
				</p>
			</div>

			{/* Compiler workspace Form Container */}
			<div className="w-full max-w-3xl mx-auto">
				<SkillCompilerForm />
			</div>

			{/* Structured Skill Libraries */}
			<SkillsLibraryGrid
				mySkills={mySkills}
				communitySkills={communitySkills}
			/>

			{/* Verified Base Blueprints */}
			<div className="space-y-6 pt-10 border-t border-border/40">
				<div className="space-y-1">
					<h2 className="text-2xl font-bold font-serif text-foreground tracking-tight flex items-center gap-2">
						<Sparkles className="h-5 w-5 text-primary" /> Verified Base
						Blueprints
					</h2>
					<p className="text-sm text-muted-foreground font-medium">
						Bootstrap or custom-tune professional blueprints designed for
						serverless architectures, agent frameworks, and flows.
					</p>
				</div>

				<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
					{BLUEPRINTS.map((bp) => (
						<BlueprintCard
							key={bp.title}
							blueprint={bp}
							isSeeding={seedingBlueprint === bp.title}
							onCustomize={handleCustomize}
							onInstantPublish={handleInstantPublish}
						/>
					))}
				</div>
			</div>
		</div>
	);
}
