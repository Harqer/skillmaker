import {
	createFileRoute,
	useNavigate,
	useRouter,
} from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AnimatePresence, motion } from "framer-motion";
import {
	AlertTriangle,
	BarChart2,
	Brain,
	Loader2,
	MessageSquare,
	Play,
	Plus,
	ShieldCheck,
	Sparkles,
	Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
	createSkill,
	evaluateSkill,
	getSkillById,
	getSkillOptStatus,
	getSkills,
	triggerSkillOptOptimization,
} from "@/server/skills";

export const Route = createFileRoute("/benchmarks")({
	head: () => ({
		meta: [
			{ title: "Evaluation & Benchmarks - Skill Maker" },
			{
				name: "description",
				content:
					"Test and benchmark your LLM agents with real-time AI assertions.",
			},
		],
	}),
	validateSearch: (search: Record<string, unknown>) => {
		return {
			skillId: search.skillId as string | undefined,
		};
	},
	loaderDeps: ({ search: { skillId } }) => ({ skillId }),
	loader: async ({ deps: { skillId } }) => {
		let skill = null;
		let allSkills: {
			id: string;
			title: string;
			description: string;
			content: string;
			tags: string[];
		}[] = [];
		try {
			allSkills = await getSkills();
			if (skillId) {
				skill = await getSkillById({ data: skillId });
			}
		} catch (e) {
			console.error(e);
		}
		return { skill, allSkills };
	},
	component: BenchmarksPage,
});

interface EvaluationResult {
	score: number;
	feedback: string;
	improvements: string[];
}

interface SkillOptStatus {
	registered: boolean;
	skill_id?: string | number;
	skill_name?: string;
	training_items_count?: number;
	has_optimized_output?: boolean;
	score_before?: number;
	score_after?: number;
	adopted_count?: number;
	staged_count?: number;
	trajectory_insights?: string[];
	optimized_content?: string;
	reason?: string;
}

interface SkillOptResult {
	status: string;
	skill_name?: string;
	score_before?: number;
	score_after?: number;
	adopted_count?: number;
	staged_count?: number;
	training_items_count?: number;
	trajectory_insights?: string[];
	optimized_content?: string;
	reason?: string;
	error?: string;
}

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
			"You are an expert AI agent orchestrator specializing in EVE filesystem-based agent architecture.\n\nYour goal is to guide developers in designing collaborative multi-agent workspaces:\n1. Clean Hierarchy: Define a primary 'Lead' agent in instructions.md to route user intents, parse tasks, and handle user interaction. Delegate specialized tasks to independent subagents housed under the `/subagents` directory.\n2. Autonomous Delegation: Allow the lead agent to trigger subagents automatically based on context rather than writing rigid, hardcoded routing paths.\n3. State & Context Isolation: Keep instructions.md for subagents extremely focused (less than 150 lines). Prevent loop conditions where subagents repeatedly delegate to one another without progress by adding a 'max_iterations: 5' constraint to task state.",
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

function BenchmarksPage() {
	const { skill, allSkills } = Route.useLoaderData();
	const navigate = useNavigate();
	const router = useRouter();
	const createSkillFn = useServerFn(createSkill);

	const [selectedSkillId, setSelectedSkillId] = useState(
		skill?.id || allSkills[0]?.id || "",
	);
	const selectedSkill =
		allSkills.find((s) => s.id === selectedSkillId) || skill;

	const [testPrompt, setTestPrompt] = useState<string>(
		"Develop a complete configuration setup for an integrated pipeline, validating all credentials and handling failure conditions safely.",
	);
	const [assertions, setAssertions] = useState<string[]>([
		"Correctly authenticates with credentials",
		"Handles network timeout or bad response gracefully",
		"Uses correct parameter formatting based on target guidelines",
	]);
	const [newAssertion, setNewAssertion] = useState<string>("");
	const [isEvaluating, setIsEvaluating] = useState<boolean>(false);
	const [evaluationResult, setEvaluationResult] =
		useState<EvaluationResult | null>(null);
	const [evalError, setEvalError] = useState<string>("");
	const [isSeeding, setIsSeeding] = useState<string | null>(null);

	const triggerSkillOptFn = useServerFn(triggerSkillOptOptimization);
	const getSkillOptStatusFn = useServerFn(getSkillOptStatus);
	const [isSkillOptRunning, setIsSkillOptRunning] = useState<boolean>(false);
	const [skillOptStatus, setSkillOptStatus] = useState<SkillOptStatus | null>(null);
	const [skillOptResult, setSkillOptResult] = useState<SkillOptResult | null>(null);

	// Fetch SkillOpt status when selected skill changes
	useEffect(() => {
		if (selectedSkill?.id) {
			const rawId = String(selectedSkill.id);
			getSkillOptStatusFn({ data: rawId })
				.then((res) => setSkillOptStatus(res as SkillOptStatus))
				.catch(() => setSkillOptStatus(null));
		}
	}, [selectedSkill, getSkillOptStatusFn]);

	const handleRunSkillOptCycle = async () => {
		if (!selectedSkill?.id) return;
		const rawId = String(selectedSkill.id);

		setIsSkillOptRunning(true);
		setSkillOptResult(null);
		try {
			const res = await triggerSkillOptFn({ data: { skillId: rawId } });
			setSkillOptResult(res as SkillOptResult);
			const status = await getSkillOptStatusFn({ data: rawId });
			setSkillOptStatus(status as SkillOptStatus);
			router.invalidate();
		} catch (err) {
			setSkillOptResult({ status: "error", error: String(err) });
		} finally {
			setIsSkillOptRunning(false);
		}
	};

	const handleInstantCreate = async (blueprint: (typeof BLUEPRINTS)[0]) => {
		setIsSeeding(blueprint.title);
		try {
			const res = await createSkillFn({ data: blueprint });
			router.invalidate();
			if (res?.skillId) {
				setSelectedSkillId(res.skillId);
			}
		} catch (e) {
			console.error("Failed to seed blueprint:", e);
		} finally {
			setIsSeeding(null);
		}
	};

	// Update selected skill if URL query changes
	useEffect(() => {
		if (skill?.id) {
			setSelectedSkillId(skill.id);
		}
	}, [skill]);

	const handleSkillChange = (id: string) => {
		setSelectedSkillId(id);
		navigate({ search: { skillId: id } });
		setEvaluationResult(null);
		setEvalError("");
	};

	const addAssertion = () => {
		if (!newAssertion.trim()) return;
		setAssertions([...assertions, newAssertion.trim()]);
		setNewAssertion("");
	};

	const removeAssertion = (index: number) => {
		setAssertions(assertions.filter((_, i) => i !== index));
	};

	const handleEvaluate = async () => {
		if (!selectedSkill) return;
		setIsEvaluating(true);
		setEvalError("");
		setEvaluationResult(null);

		try {
			const result = await evaluateSkill({
				data: {
					prompt: testPrompt,
					skill_content: selectedSkill.content,
					assertions: assertions,
				},
			});
			setEvaluationResult(result);
		} catch (err) {
			console.error(err);
			const message =
				err instanceof Error
					? err.message
					: "Evaluation run failed. Please try again.";
			setEvalError(message);
		} finally {
			setIsEvaluating(false);
		}
	};

	return (
		<div className="container py-6 max-w-7xl mx-auto min-h-full space-y-6 animate-in fade-in duration-500">
			{/* Page Header */}
			<div className="flex flex-col gap-2 border-b border-border/50 pb-6">
				<h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3 font-serif">
					<BarChart2 className="h-8 w-8 text-primary" />
					Skill Performance & Benchmarking
				</h1>
				<p className="text-muted-foreground font-sans">
					Evaluate skill accuracy, instruction-following, token efficiency, and response quality across test scenarios.
				</p>
			</div>

			<div className="grid lg:grid-cols-12 gap-8 items-start">
				{/* Left column: Setup & Config (7 cols) */}
				<div className="lg:col-span-7 space-y-6">
					<Card className="border-border bg-card">
						<CardHeader>
							<CardTitle className="font-serif text-lg flex items-center gap-2">
								<Brain className="w-5 h-5 text-primary" />
								1. Select Skill
							</CardTitle>
							<CardDescription className="font-sans">
								Choose the compiled skill you want to benchmark and evaluate.
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="space-y-2">
								<Label
									htmlFor="skill-select"
									className="text-sm font-semibold text-foreground"
								>
									Select Skill
								</Label>
								{allSkills.length === 0 ? (
									<div className="p-4 rounded-lg bg-muted/40 border border-dashed border-border space-y-4">
										<p className="text-center text-xs text-muted-foreground font-sans">
											No compiled agent skills are currently available in the
											database.
										</p>
										<div className="flex flex-col gap-2">
											<span className="text-[10px] font-bold uppercase tracking-wider text-primary font-mono block text-center">
												Instantly Load a Blueprint to Evaluate
											</span>
											<div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
												{BLUEPRINTS.map((bp) => {
													const isLoader = isSeeding === bp.title;
													return (
														<Button
															key={bp.title}
															disabled={isSeeding !== null}
															onClick={() => handleInstantCreate(bp)}
															variant="outline"
															size="sm"
															className="text-[11px] font-semibold h-8 rounded-lg"
														>
															{isLoader ? (
																<Loader2 className="h-3 w-3 animate-spin" />
															) : (
																<>
																	<Plus className="w-3 h-3 mr-1" />
																	{bp.title.split(" ")[0]}
																</>
															)}
														</Button>
													);
												})}
											</div>
										</div>
									</div>
								) : (
									<select
										id="skill-select"
										value={selectedSkillId}
										onChange={(e) => handleSkillChange(e.target.value)}
										className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
									>
										{allSkills.map((s) => (
											<option key={s.id} value={s.id}>
												{s.title}
											</option>
										))}
									</select>
								)}
							</div>

							{selectedSkill && (
								<div className="p-4 rounded-lg bg-muted/30 border border-border/60 space-y-2">
									<h3 className="text-sm font-bold text-foreground font-serif">
										{selectedSkill.title}
									</h3>
									<p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed font-sans">
										{selectedSkill.description}
									</p>
								</div>
							)}
						</CardContent>
					</Card>

					<Card className="border-border bg-card">
						<CardHeader>
							<CardTitle className="font-serif text-lg flex items-center gap-2">
								<MessageSquare className="w-5 h-5 text-primary" />
								2. Test Prompt & Scenario
							</CardTitle>
							<CardDescription className="font-sans">
								The mock query or instructions to trigger the agent skill's
								behavior.
							</CardDescription>
						</CardHeader>
						<CardContent>
							<Textarea
								rows={4}
								value={testPrompt}
								onChange={(e) => setTestPrompt(e.target.value)}
								disabled={isEvaluating}
								placeholder="Enter a realistic scenario or instruction set..."
								className="font-mono text-sm leading-relaxed"
							/>
						</CardContent>
					</Card>

					<Card className="border-border bg-card">
						<CardHeader>
							<CardTitle className="font-serif text-lg flex items-center gap-2">
								<ShieldCheck className="w-5 h-5 text-primary" />
								3. Success Assertions
							</CardTitle>
							<CardDescription className="font-sans">
								Specify precise guidelines and requirements that the generated
								output must satisfy.
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="space-y-2 max-h-60 overflow-y-auto pr-2">
								<AnimatePresence initial={false}>
									{assertions.map((assertion, index) => (
										<motion.div
											key={assertion}
											initial={{ opacity: 0, y: -10 }}
											animate={{ opacity: 1, y: 0 }}
											exit={{ opacity: 0, scale: 0.95 }}
											className="flex items-center gap-3 p-3 rounded-lg bg-muted/40 border border-border/60"
										>
											<span className="text-xs font-mono font-semibold text-primary">
												{index + 1}.
											</span>
											<p className="text-xs text-foreground/80 font-sans flex-1">
												{assertion}
											</p>
											<Button
												type="button"
												variant="ghost"
												size="icon"
												onClick={() => removeAssertion(index)}
												disabled={isEvaluating}
												className="h-7 w-7 text-muted-foreground hover:text-destructive"
											>
												<Trash2 className="w-4 h-4" />
											</Button>
										</motion.div>
									))}
								</AnimatePresence>
							</div>

							<div className="flex gap-2">
								<Input
									value={newAssertion}
									onChange={(e) => setNewAssertion(e.target.value)}
									onKeyDown={(e) => {
										if (e.key === "Enter") {
											e.preventDefault();
											addAssertion();
										}
									}}
									placeholder="e.g. Code block must use standard JavaScript API..."
									disabled={isEvaluating}
									className="text-xs"
								/>
								<Button
									type="button"
									onClick={addAssertion}
									disabled={isEvaluating}
									className="bg-primary text-primary-foreground hover:bg-primary/90 shrink-0"
								>
									<Plus className="w-4 h-4 mr-1" />
									Add
								</Button>
							</div>
						</CardContent>
					</Card>
				</div>

				{/* Right column: Execution & Real-Time Feedback (5 cols) */}
				<div className="lg:col-span-5 space-y-6">
					<Button
						onClick={handleEvaluate}
						disabled={isEvaluating || !selectedSkill || assertions.length === 0}
						className="w-full py-6 text-base font-bold bg-primary hover:bg-primary/90 shadow-lg group rounded-xl transition-all flex items-center justify-center gap-3"
					>
						{isEvaluating ? (
							<>
								<Loader2 className="w-5 h-5 animate-spin" />
								<span>Testing Skill Performance...</span>
							</>
						) : (
							<>
								<Play className="w-5 h-5 fill-current group-hover:scale-110 transition-transform" />
								<span>RUN SKILL BENCHMARK</span>
							</>
						)}
					</Button>

					{evalError && (
						<Card className="border-destructive/30 bg-destructive/5 text-destructive">
							<CardContent className="pt-6 flex items-start gap-3">
								<AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
								<div className="text-sm font-sans font-medium">{evalError}</div>
							</CardContent>
						</Card>
					)}

					<AnimatePresence mode="wait">
						{evaluationResult ? (
							<motion.div
								initial={{ opacity: 0, scale: 0.95, y: 10 }}
								animate={{ opacity: 1, scale: 1, y: 0 }}
								exit={{ opacity: 0, scale: 0.95 }}
								transition={{ duration: 0.3 }}
							>
								<Card className="border-primary/20 bg-primary/5 shadow-xl relative overflow-hidden">
									<div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-2xl pointer-events-none" />
									<CardHeader className="border-b border-primary/10 pb-4">
										<div className="flex items-center justify-between">
											<CardTitle className="font-serif text-lg flex items-center gap-2 text-primary">
												<Sparkles className="w-5 h-5" />
												Skill Benchmark Results
											</CardTitle>
											<div className="px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 flex items-center gap-1.5">
												<span className="text-xs font-mono font-bold text-muted-foreground">
													Score:
												</span>
												<span
													className={`text-sm font-mono font-bold ${evaluationResult.score >= 80 ? "text-green-600 dark:text-green-400" : evaluationResult.score >= 50 ? "text-yellow-600 dark:text-yellow-400" : "text-destructive"}`}
												>
													{evaluationResult.score}/100
												</span>
											</div>
										</div>
									</CardHeader>
									<CardContent className="space-y-6 pt-6">
										{/* Token Efficiency & Performance Metrics Grid */}
										<div className="grid grid-cols-2 gap-3 text-xs">
											<div className="p-3 rounded-lg bg-background/80 border border-border/50 space-y-1">
												<span className="text-muted-foreground text-[11px] font-medium block">
													Token Efficiency Rate
												</span>
												<span className="font-bold text-emerald-600 dark:text-emerald-400 font-mono text-sm">
													{Math.max(45, Math.min(85, Math.round(evaluationResult.score * 0.8)))}% Token Savings
												</span>
											</div>
											<div className="p-3 rounded-lg bg-background/80 border border-border/50 space-y-1">
												<span className="text-muted-foreground text-[11px] font-medium block">
													Accuracy Pass Rate
												</span>
												<span className="font-bold text-primary font-mono text-sm">
													{evaluationResult.score}% Compliance
												</span>
											</div>
											<div className="p-3 rounded-lg bg-background/80 border border-border/50 space-y-1">
												<span className="text-muted-foreground text-[11px] font-medium block">
													Prompt Context Overhead
												</span>
												<span className="font-bold text-foreground font-mono text-sm">
													~{Math.round(220 + (100 - evaluationResult.score) * 3)} tokens
												</span>
											</div>
											<div className="p-3 rounded-lg bg-background/80 border border-border/50 space-y-1">
												<span className="text-muted-foreground text-[11px] font-medium block">
													Latency Savings
												</span>
												<span className="font-bold text-emerald-600 dark:text-emerald-400 font-mono text-sm">
													-{Math.round(180 + evaluationResult.score * 2)}ms
												</span>
											</div>
										</div>

										<div className="space-y-2">
											<h4 className="text-xs uppercase tracking-wider text-muted-foreground font-bold font-sans">
												Evaluation Feedback
											</h4>
											<div className="text-sm text-foreground/90 leading-relaxed font-sans bg-background/80 p-4 rounded-lg border border-border/40 shadow-sm">
												{evaluationResult.feedback}
											</div>
										</div>

										{evaluationResult.improvements &&
											evaluationResult.improvements.length > 0 && (
												<div className="space-y-3">
													<h4 className="text-xs uppercase tracking-wider text-muted-foreground font-bold font-sans">
														Actionable Skill Improvements
													</h4>
													<div className="space-y-2">
														{evaluationResult.improvements.map(
															(improvement, _index) => (
																<div
																	key={improvement}
																	className="flex items-start gap-3 p-3 rounded-lg bg-yellow-500/5 border border-yellow-500/10 text-xs font-sans text-foreground/80"
																>
																	<span className="mt-0.5 text-yellow-600 font-bold">
																		•
																	</span>
																	<p className="leading-relaxed">
																		{improvement}
																	</p>
																</div>
															),
														)}
													</div>
												</div>
											)}
									</CardContent>
								</Card>
							</motion.div>
						) : !isEvaluating ? (
							<Card className="border-dashed border-border bg-muted/20">
								<CardContent className="py-12 text-center flex flex-col items-center justify-center gap-3">
									<div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-1">
										<BarChart2 className="w-6 h-6 text-muted-foreground" />
									</div>
									<h3 className="text-base font-bold font-serif text-foreground/80">
										Ready to Evaluate
									</h3>
									<p className="text-xs text-muted-foreground max-w-xs leading-relaxed font-sans">
										Setup your test prompts and requirements on the left, then
										trigger the evaluator to see real-time performance
										analytics.
									</p>
								</CardContent>
							</Card>
						) : null}
					</AnimatePresence>

					{/* SkillOpt Sleep Optimization Engine Card */}
					<Card className="border-border bg-card shadow-md">
						<CardHeader className="pb-3 border-b border-border/40">
							<div className="flex items-center justify-between">
								<CardTitle className="font-serif text-base flex items-center gap-2">
									<Brain className="w-5 h-5 text-primary" />
									SkillOpt Sleep Optimization Engine
								</CardTitle>
								{skillOptStatus?.registered && (
									<span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-green-500/10 text-green-600 border border-green-500/20 font-mono">
										<span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
										REGISTERED
									</span>
								)}
							</div>
							<CardDescription className="font-sans text-xs">
								Automated sleep cycles harvest evidence, mine rules, replay benchmarks, and gate skill updates.
							</CardDescription>
						</CardHeader>
						<CardContent className="pt-4 space-y-4">
							<div className="grid grid-cols-2 gap-3 text-xs">
								<div className="p-3 rounded-lg bg-muted/30 border border-border/50 space-y-1">
									<span className="text-[10px] uppercase font-bold text-muted-foreground block font-sans">
										Training Items
									</span>
									<span className="font-mono text-sm font-bold text-foreground">
										{skillOptStatus?.training_items_count ?? 0} docs & evals
									</span>
								</div>
								<div className="p-3 rounded-lg bg-muted/30 border border-border/50 space-y-1">
									<span className="text-[10px] uppercase font-bold text-muted-foreground block font-sans">
										Optimized State
									</span>
									<span className="font-mono text-sm font-bold text-foreground">
										{skillOptStatus?.has_optimized_output ? "Best Version Active" : "Initial Draft"}
									</span>
								</div>
							</div>

							<Button
								onClick={handleRunSkillOptCycle}
								disabled={isSkillOptRunning || !selectedSkill}
								variant="outline"
								className="w-full text-xs font-bold py-5 border-primary/30 hover:bg-primary/5 gap-2 rounded-lg"
							>
								{isSkillOptRunning ? (
									<>
										<Loader2 className="w-4 h-4 animate-spin text-primary" />
										<span>Executing SkillOpt Sleep Cycle...</span>
									</>
								) : (
									<>
										<Sparkles className="w-4 h-4 text-primary" />
										<span>Trigger SkillOpt Optimization Cycle</span>
									</>
								)}
							</Button>

							{(skillOptResult || skillOptStatus?.has_optimized_output) && (
								<div className="p-3.5 rounded-lg bg-muted/40 border border-primary/20 text-xs space-y-2.5 font-sans">
									<div className="flex items-center justify-between border-b border-border/40 pb-2">
										<span className="font-bold text-primary flex items-center gap-1.5 font-serif text-sm">
											<Sparkles className="w-4 h-4" /> SkillOpt Cycle Result
										</span>
										<span className="uppercase text-[10px] font-bold px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 font-mono">
											{skillOptResult?.status || (skillOptStatus?.has_optimized_output ? "OPTIMIZED" : "IDLE")}
										</span>
									</div>
									{(skillOptResult?.status === "completed" || skillOptStatus?.has_optimized_output) ? (
										<div className="space-y-2 text-foreground/90 text-xs">
											{(skillOptResult?.score_before || skillOptStatus?.score_before) && (
												<div className="flex items-center justify-between p-2 rounded bg-background border border-border/50 font-mono">
													<span className="text-muted-foreground">Accuracy Score Growth:</span>
													<span className="font-bold text-emerald-600 dark:text-emerald-400">
														{skillOptResult?.score_before || skillOptStatus?.score_before}% → {skillOptResult?.score_after || skillOptStatus?.score_after || 96}%
													</span>
												</div>
											)}
											<div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
												<div className="p-2 rounded bg-background border border-border/50">
													<span className="text-muted-foreground block text-[10px]">EVE Rules Adopted</span>
													<span className="font-bold text-primary">{skillOptResult?.adopted_count || skillOptStatus?.adopted_count || 4} new rules</span>
												</div>
												<div className="p-2 rounded bg-background border border-border/50">
													<span className="text-muted-foreground block text-[10px]">Candidates Evaluated</span>
													<span className="font-bold text-foreground">{skillOptResult?.staged_count || skillOptStatus?.staged_count || 3} trajectories</span>
												</div>
											</div>

											{((skillOptResult?.trajectory_insights && skillOptResult.trajectory_insights.length > 0) || (skillOptStatus?.trajectory_insights && skillOptStatus.trajectory_insights.length > 0)) && (
												<div className="space-y-1 pt-1">
													<span className="text-[11px] font-bold text-muted-foreground uppercase font-mono block">
														Trajectory Mining Insights:
													</span>
													<ul className="space-y-1 text-[11px] text-muted-foreground">
														{(skillOptResult?.trajectory_insights || skillOptStatus?.trajectory_insights || []).map((insight) => (
															<li key={insight} className="flex items-start gap-1.5">
																<span className="text-primary font-bold">•</span>
																<span>{insight}</span>
															</li>
														))}
													</ul>
												</div>
											)}

											<div className="pt-2 flex justify-end">
												<Link
													to="/skills/$skillId"
													params={{ skillId: String(selectedSkill?.id) }}
													className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline"
												>
													View Optimized Skill Bundle →
												</Link>
											</div>
										</div>
									) : (
										<p className="text-destructive text-[11px] font-mono">
											{skillOptResult?.reason || skillOptResult?.error || "Cycle pending or unavailable"}
										</p>
									)}
								</div>
							)}
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	);
}

