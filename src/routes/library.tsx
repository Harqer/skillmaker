import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { motion } from "framer-motion";
import {
	Activity,
	Brain,
	Cpu,
	Layers,
	Loader2,
	Plus,
	Sparkles,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { createSkill, getSkills } from "@/server/skills";

export interface Skill {
	id: string;
	title: string;
	description: string;
	content: string;
	tags: string[];
	authorId: string;
	upvotes: number;
	createdAt: string;
}

export const Route = createFileRoute("/library")({
	head: () => ({
		meta: [
			{ title: "Library - Skill Maker" },
			{
				name: "description",
				content: "Your personal collection of skills and subagents.",
			},
		],
	}),
	loader: async () => {
		let allSkills: Skill[] = [];
		try {
			allSkills = (await getSkills()) as Skill[];
		} catch (e) {
			console.error(e);
		}
		return { allSkills };
	},
	component: LibraryPage,
});

// Quick Start Blueprints (Real data, no mocks, instant publishable templates)
const BLUEPRINTS = [
	{
		title: "PostgreSQL Database Architect",
		description:
			"Design production-ready database schemas, configure pooled connections, and optimize performance.",
		content:
			"You are a senior database optimization expert specializing in PostgreSQL and drizzle-orm.\n\nYour mandate is to guide the user to write highly scalable SQL schemas, optimized indexes, and connection handlers. Always follow these best practices:\n1. Connection Management: Use connection pool clients in serverless or containerized environments. Cache the connection pool globally so that multiple warm invokes can reuse the client.\n2. Lazy Initialization: Do not instantiate database connections at module load. Initialize them lazily inside handlers.\n3. Query Optimization: Prefer explicit select fields instead of full table scans (e.g. `select({ id, name })`). Always generate appropriate indexes on foreign key relations and common query filters.\n4. Transaction Safety: Design atomic transactions using drizzle-orm with strict error boundaries, ensuring that failed multi-table operations are rolled back completely.",
		tags: ["Postgres", "Database", "Drizzle"],
	},
	{
		title: "Lead Agent Orchestrator",
		description:
			"Coordinate hierarchical multi-agent teams. Delegate modular filesystem tasks and manage state.",
		content:
			"You are an expert AI agent orchestrator specializing in EVE filesystem-based agent architecture.\n\nYour goal is to guide developers in designing collaborative multi-agent workspaces:\n1. Clean Hierarchy: Define a primary 'Lead' agent in instructions.md to route user intents, parse tasks, and handle user interaction. Delegate specialized tasks to independent subagents housed under the `/subagents` directory.\n2. Autonomous Delegation: Allow the lead agent to trigger subagents automatically based on context rather than writing rigid, hardcoded routing paths.\n3. State & Context Isolation: Keep instructions.md for subagents extremely focused (less than 150 lines). Prevent loop conditions where subagents repeatedly delegate to one another without progress by establishing clear task completion exit criteria.",
		tags: ["Agent", "Orchestration", "EVE"],
	},
	{
		title: "Google Genkit Router",
		description:
			"Build robust agent actions, dynamic tool schemas, and model switching logic.",
		content:
			"You are a senior Genkit engineer specializing in Flow-based multi-agent routing.\n\nYour mission is to guide developers through constructing robust agent pipelines using Genkit:\n1. Explicit Schema: Always define strict input and output contracts for independent agent actions using Zod schemas.\n2. Middleware Pipeline: Use Genkit middleware for cross-agent validation, logging, and security checks. Never pass unvetted user inputs directly to tools.\n3. Dynamic Tool Injection: Treat agent actions as modular tool objects, allowing the central router model to select them on-demand. Support multi-model orchestration, switching models dynamically depending on complexity (e.g. Gemini 2.5 Flash for speed, Gemini 1.5 Pro for deep analysis).",
		tags: ["Google Genkit", "AI", "Flows"],
	},
];

const getSkillIcon = (title: string, tags: string[] = []) => {
	const t = `${title} ${tags.join(" ")}`.toLowerCase();
	if (
		t.includes("db") ||
		t.includes("postgres") ||
		t.includes("neon") ||
		t.includes("sql")
	)
		return Layers;
	if (
		t.includes("agent") ||
		t.includes("eve") ||
		t.includes("multi") ||
		t.includes("coordinator")
	)
		return Cpu;
	if (t.includes("kit") || t.includes("google") || t.includes("genkit"))
		return Sparkles;
	return Brain;
};

function ArcGallery({ items }: { items: Skill[] }) {
	const [isHovered, setIsHovered] = useState(false);

	// Calculate arc parameters
	const totalItems = items.length;
	const maxRotation = totalItems > 1 ? 40 : 0; // max rotation angle for the outermost cards

	return (
		<section
			aria-label="Interactive Arc Gallery"
			className="relative flex items-center justify-center h-[500px] w-full"
			onMouseEnter={() => setIsHovered(true)}
			onMouseLeave={() => setIsHovered(false)}
		>
			<div className="relative flex items-center justify-center">
				{items.map((item, index) => {
					// Math for the arc
					const progress = totalItems > 1 ? index / (totalItems - 1) : 0.5; // 0 to 1
					const centeredProgress = progress - 0.5; // -0.5 to 0.5

					const targetRotation = centeredProgress * maxRotation;
					const targetY = Math.abs(centeredProgress) * 50;
					const targetX = centeredProgress * (totalItems > 3 ? 360 : 260); // spread width

					// When NOT hovered: stacked slightly
					const stackedRotation = centeredProgress * 12;
					const stackedY = index * 4;
					const stackedX = centeredProgress * 30;
					const zIndex = totalItems - Math.abs(centeredProgress * 10);

					const IconComponent = getSkillIcon(item.title, item.tags);

					return (
						<motion.div
							key={item.id}
							className="absolute origin-bottom"
							style={{ zIndex: Math.floor(zIndex) }}
							initial={false}
							animate={{
								rotate: isHovered ? targetRotation : stackedRotation,
								y: isHovered ? targetY : stackedY,
								x: isHovered ? targetX : stackedX,
								scale: isHovered ? 1 : 1 - Math.abs(centeredProgress) * 0.05,
							}}
							transition={{
								type: "spring",
								stiffness: 260,
								damping: 20,
							}}
							whileHover={{
								scale: 1.05,
								y: targetY - 20,
								zIndex: 100,
								transition: { duration: 0.2 },
							}}
						>
							<Card className="w-64 h-[22rem] shadow-xl border-border bg-card hover:border-primary/50 transition-colors group overflow-hidden flex flex-col">
								<Link to={`/skills/${item.id}`} className="flex-1">
									<div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
									<CardHeader>
										<div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mb-2">
											<IconComponent className="w-5 h-5 text-primary" />
										</div>
										<div className="text-xs font-semibold text-primary uppercase tracking-wider mb-1 font-sans">
											{item.tags?.[0] || "Custom"}
										</div>
										<CardTitle className="leading-tight font-serif text-base">
											{item.title}
										</CardTitle>
									</CardHeader>
									<CardContent>
										<CardDescription className="text-sm line-clamp-4 font-sans text-muted-foreground">
											{item.description}
										</CardDescription>
									</CardContent>
								</Link>
								<CardFooter className="mt-auto border-t border-border pt-4 bg-muted/20">
									<Link
										to="/benchmarks"
										search={{ skillId: item.id }}
										className="w-full"
									>
										<Button
											variant="outline"
											className="w-full bg-background border-border hover:bg-primary hover:text-primary-foreground transition-colors text-xs py-1"
										>
											<Activity className="w-3.5 h-3.5 mr-2" />
											Benchmark Skill
										</Button>
									</Link>
								</CardFooter>
							</Card>
						</motion.div>
					);
				})}
			</div>

			{totalItems > 1 && !isHovered && (
				<motion.div
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					className="absolute bottom-10 px-4 py-2 bg-background/80 backdrop-blur-sm rounded-full text-sm font-medium text-muted-foreground border border-border shadow-sm pointer-events-none font-sans"
				>
					Hover to expand your collection
				</motion.div>
			)}
		</section>
	);
}

function LibraryPage() {
	const { allSkills } = Route.useLoaderData();
	const createSkillFn = useServerFn(createSkill);
	const router = useRouter();
	const [isCreating, setIsCreating] = useState<string | null>(null);

	const handleInstantCreate = async (blueprint: (typeof BLUEPRINTS)[0]) => {
		setIsCreating(blueprint.title);
		try {
			await createSkillFn({ data: blueprint });
			router.invalidate();
		} catch (e) {
			console.error("Failed to seed blueprint:", e);
		} finally {
			setIsCreating(null);
		}
	};

	return (
		<div className="container py-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500 min-h-full">
			<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/50 pb-6">
				<div className="flex flex-col gap-2">
					<h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3 font-serif">
						<Layers className="h-8 w-8 text-primary" />
						Library & Collection
					</h1>
					<p className="text-muted-foreground font-sans">
						Manage your personal skills and curated subagents.
					</p>
				</div>
				<Link to="/submit">
					<Button
						size="sm"
						className="bg-primary hover:bg-primary/95 text-primary-foreground font-semibold rounded-full px-5 shadow-sm"
					>
						<Plus className="w-4 h-4 mr-1.5" />
						Create Custom Skill
					</Button>
				</Link>
			</div>

			{allSkills.length > 0 ? (
				<div className="bg-muted/10 rounded-2xl border border-border overflow-hidden p-6">
					<ArcGallery items={allSkills} />
				</div>
			) : (
				<div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center bg-card border border-border/80 rounded-2xl p-8 lg:p-12 shadow-sm">
					<div className="lg:col-span-5 space-y-6">
						<div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
							<Sparkles className="w-6 h-6 text-primary" />
						</div>
						<div className="space-y-3">
							<h2 className="text-2xl font-bold font-serif tracking-tight">
								Your Library is Empty
							</h2>
							<p className="text-sm text-muted-foreground leading-relaxed">
								Create real, durable, and compiled AI agent skills. Instantly
								publish a live, battle-tested blueprint to your library with a
								single click below to get started immediately.
							</p>
						</div>
						<div className="flex items-center gap-3 text-xs font-mono text-muted-foreground bg-muted/30 p-3 rounded-lg border border-border/40">
							<span className="relative flex h-2 w-2">
								<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary/40"></span>
								<span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
							</span>
							<span>
								No mock data or placeholders — instant live database records
							</span>
						</div>
					</div>

					<div className="lg:col-span-7 space-y-4">
						<span className="text-[10px] font-bold uppercase tracking-widest text-primary font-mono block">
							Quick-Start Blueprints
						</span>
						<div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
							{BLUEPRINTS.map((bp) => {
								const Icon = getSkillIcon(bp.title, bp.tags);
								const isLoader = isCreating === bp.title;
								return (
									<Card
										key={bp.title}
										className="flex flex-col border border-border/60 bg-muted/20 hover:bg-muted/30 hover:border-primary/40 transition-all duration-300 relative overflow-hidden group"
									>
										<CardHeader className="flex-1 p-4 pb-2">
											<div className="w-8 h-8 rounded-full bg-background flex items-center justify-center mb-2 shadow-sm">
												<Icon className="w-4 h-4 text-primary" />
											</div>
											<CardTitle className="text-sm font-bold leading-tight">
												{bp.title}
											</CardTitle>
											<CardDescription className="text-[11px] leading-relaxed mt-1 line-clamp-3">
												{bp.description}
											</CardDescription>
										</CardHeader>
										<CardFooter className="p-4 pt-2">
											<Button
												disabled={isCreating !== null}
												onClick={() => handleInstantCreate(bp)}
												className="w-full text-xs font-bold rounded-lg h-8 bg-primary hover:bg-primary/90 text-primary-foreground"
											>
												{isLoader ? (
													<Loader2 className="h-3 w-3 animate-spin" />
												) : (
													<>
														<Plus className="w-3.5 h-3.5 mr-1" />
														Load Live
													</>
												)}
											</Button>
										</CardFooter>
									</Card>
								);
							})}
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
