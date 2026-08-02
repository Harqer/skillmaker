import { createFileRoute, Link } from "@tanstack/react-router";
import {
	ArrowLeft,
	Check,
	Code,
	Copy,
	Download,
	ExternalLink,
	FileCode,
	FileText,
	Globe,
	Library,
	Settings,
	Sparkles,
	Terminal,
	ThumbsUp,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "../components/ui/button";
import {
	Card,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "../components/ui/card";
import { getSkillById } from "../server/skills";

export const Route = createFileRoute("/skills/$skillId")({
	head: ({ loaderData }) => ({
		meta: [
			{
				title: loaderData?.skill
					? `${loaderData.skill.title} - Raven Expert AI Agent`
					: "Skill Details - Raven",
			},
			{
				name: "description",
				content: loaderData?.skill
					? loaderData.skill.description
					: "View details of this AI agent.",
			},
		],
	}),
	loader: async ({ params }) => {
		return {
			skill: await getSkillById({ data: params.skillId }),
		};
	},
	component: SkillDetailPage,
	errorComponent: () => (
		<div className="container py-24 text-center">Skill not found!</div>
	),
});

function SkillDetailPage() {
	const { skill } = Route.useLoaderData();
	const [copied, setCopied] = useState(false);
	const [activeTab, setActiveTab] = useState<
		"eve" | "mcp_script" | "mcp_config"
	>("eve");
	const [activeEveFile, setActiveEveFile] = useState<string>("");

	// Attempt to parse Eve files JSON (orchestrator output format)
	let parsedEveFiles: Record<string, string> | null = null;
	try {
		parsedEveFiles = JSON.parse(skill.content);
	} catch {
		parsedEveFiles = null;
	}

	const eveFileKeys = parsedEveFiles ? Object.keys(parsedEveFiles) : [];
	const eveKeysString = eveFileKeys.join(",");

	// biome-ignore lint/correctness/useExhaustiveDependencies: eveKeysString serializes keys to prevent re-triggering loop
	useEffect(() => {
		if (eveFileKeys.length > 0 && !activeEveFile) {
			// Prioritize instructions.md as the active file if it exists
			if (eveFileKeys.includes("instructions.md")) {
				setActiveEveFile("instructions.md");
			} else {
				setActiveEveFile(eveFileKeys[0]);
			}
		}
	}, [eveKeysString, activeEveFile]);

	// Determine active content to display
	let displayCode = "";
	if (activeTab === "eve") {
		displayCode = parsedEveFiles
			? parsedEveFiles[activeEveFile] || ""
			: skill.content;
	} else if (activeTab === "mcp_script") {
		displayCode =
			skill.mcpScript ||
			"# MCP Server Script was not requested/generated for this skill.";
	} else if (activeTab === "mcp_config") {
		displayCode =
			skill.mcpConfig ||
			"// MCP Config was not requested/generated for this skill.";
	}

	const handleCopy = async () => {
		try {
			await navigator.clipboard.writeText(displayCode);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch (err) {
			console.error("Failed to copy text: ", err);
		}
	};

	const handleDownloadFile = (filename: string, text: string) => {
		const element = document.createElement("a");
		const file = new Blob([text], { type: "text/plain;charset=utf-8" });
		element.href = URL.createObjectURL(file);
		element.download = filename;
		document.body.appendChild(element);
		element.click();
		document.body.removeChild(element);
	};

	const handleDownloadFullBundle = () => {
		// Package files into a single downloadable script or setup JSON
		const bundle: Record<string, string> = {};
		if (parsedEveFiles) {
			Object.assign(bundle, parsedEveFiles);
		} else {
			bundle["SKILL.md"] = skill.content;
		}
		if (skill.mcpScript) {
			bundle["mcp_server.py"] = skill.mcpScript;
		}
		if (skill.mcpConfig) {
			bundle["mcp_config.json"] = skill.mcpConfig;
		}

		const payload = JSON.stringify(bundle, null, 2);
		handleDownloadFile(
			`${skill.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-bundle.json`,
			payload,
		);
	};

	return (
		<div className="relative isolate w-full bg-background pb-16">
			<div className="container max-w-5xl mx-auto py-8 animate-in fade-in duration-500 relative z-10 space-y-6">
				{/* Top Navigation Bar */}
				<div className="flex flex-wrap items-center justify-between gap-3 pb-2">
					<Link
						to="/"
						className="inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors bg-muted/40 hover:bg-muted/70 px-3.5 py-2 rounded-xl border border-border/50"
					>
						<ArrowLeft className="h-4 w-4" />
						Back to Skill Maker
					</Link>

					<div className="flex items-center gap-2">
						<Link
							to="/library"
							className="inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors bg-muted/40 hover:bg-muted/70 px-3.5 py-2 rounded-xl border border-border/50"
						>
							<Library className="h-4 w-4 text-primary" />
							My Library
						</Link>
						<Link
							to="/explore"
							className="inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors bg-muted/40 hover:bg-muted/70 px-3.5 py-2 rounded-xl border border-border/50"
						>
							<Globe className="h-4 w-4 text-blue-500" />
							Explore Community
						</Link>
					</div>
				</div>

				{/* Skill Profile Header Card */}
				<Card className="border border-border/80 bg-card shadow-lg overflow-hidden relative text-center">
					<div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent pointer-events-none" />

					<CardHeader className="space-y-6 pb-8 relative z-10 flex flex-col items-center text-center">
						<div className="flex flex-col items-center justify-center gap-4 max-w-3xl mx-auto">
							<div className="inline-flex items-center gap-2 px-3 py-1 text-xs font-semibold rounded-full border border-primary/25 bg-primary/10 text-primary">
								<Sparkles className="w-3.5 h-3.5" />
								Compiled AI Agent Skill
							</div>
							<CardTitle className="text-4xl font-serif font-extrabold tracking-tight text-foreground">
								{skill.title}
							</CardTitle>
							<CardDescription className="text-base text-muted-foreground leading-relaxed">
								{skill.description}
							</CardDescription>

							<div className="flex items-center gap-3 pt-2">
								<Button
									variant="outline"
									className="gap-2 h-10 px-4 bg-primary/10 border-primary/20 hover:bg-primary hover:text-primary-foreground text-primary transition-all"
								>
									<ThumbsUp className="h-4 w-4" />
									<span className="font-bold">{skill.upvotes}</span>
								</Button>
								<Link
									to="/benchmarks"
									search={{ skillId: String(skill.id) }}
									className="inline-flex items-center gap-2 h-10 px-4 font-bold text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-all shadow-sm"
								>
									<Sparkles className="h-4 w-4" />
									<span>Benchmark & SkillOpt Optimize</span>
								</Link>
							</div>
						</div>

						<div className="flex flex-wrap justify-center gap-2.5 pt-2">
							{skill.tags.map((tag) => (
								<span
									key={tag}
									className="inline-flex items-center rounded-md bg-muted px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-foreground/80 border border-border"
								>
									{tag}
								</span>
							))}
						</div>
					</CardHeader>
				</Card>

				{/* Interactive Centered Workspace */}
				<div className="flex flex-col items-center w-full max-w-4xl mx-auto space-y-6">
					{/* Top Artifact Navigation Bar */}
					<div className="flex flex-wrap items-center justify-center gap-2 p-1.5 bg-muted/40 border border-border/80 rounded-2xl w-full">
						<Button
							variant={activeTab === "eve" ? "default" : "ghost"}
							onClick={() => setActiveTab("eve")}
							className="gap-2 font-semibold text-xs h-9 rounded-xl px-4"
						>
							<Code className="w-4 h-4" />
							Eve Framework Files
						</Button>
						<Button
							variant={activeTab === "mcp_script" ? "default" : "ghost"}
							onClick={() => setActiveTab("mcp_script")}
							className="gap-2 font-semibold text-xs h-9 rounded-xl px-4"
							disabled={!skill.mcpScript}
						>
							<Terminal className="w-4 h-4" />
							MCP Server Python
						</Button>
						<Button
							variant={activeTab === "mcp_config" ? "default" : "ghost"}
							onClick={() => setActiveTab("mcp_config")}
							className="gap-2 font-semibold text-xs h-9 rounded-xl px-4"
							disabled={!skill.mcpConfig}
						>
							<Settings className="w-4 h-4" />
							MCP Server Config
						</Button>
					</div>

					{/* Eve Sub-Files Selector Bar */}
					{activeTab === "eve" && parsedEveFiles && eveFileKeys.length > 0 && (
						<div className="flex flex-wrap items-center justify-center gap-1.5 p-2 bg-card border border-border/60 rounded-2xl w-full shadow-sm">
							{eveFileKeys.map((fileKey) => {
								const isMD = fileKey.endsWith(".md");
								return (
									<Button
										key={fileKey}
										variant={activeEveFile === fileKey ? "secondary" : "ghost"}
										onClick={() => setActiveEveFile(fileKey)}
										className="gap-2 font-medium text-xs h-8 px-3 rounded-xl"
									>
										{isMD ? (
											<FileText className="w-3.5 h-3.5 text-primary" />
										) : (
											<FileCode className="w-3.5 h-3.5 text-blue-500" />
										)}
										{fileKey}
									</Button>
								);
							})}
						</div>
					)}

					{/* Actions & Export Toolbar */}
					<div className="flex flex-wrap items-center justify-between w-full px-2 gap-3">
						<span className="text-xs font-bold text-muted-foreground font-mono">
							{activeTab === "eve"
								? `Eve Agent / ${activeEveFile || "SKILL.md"}`
								: activeTab === "mcp_script"
									? "mcp_server.py"
									: "mcp_config.json"}
						</span>
						<div className="flex flex-wrap items-center gap-2">
							<Button
								size="sm"
								variant="outline"
								className="text-xs h-8 gap-1.5 rounded-xl px-3 bg-card shadow-sm"
								onClick={handleCopy}
							>
								{copied ? (
									<Check className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
								) : (
									<Copy className="h-3.5 w-3.5" />
								)}
								Copy Code
							</Button>
							<Button
								size="sm"
								variant="outline"
								className="text-xs h-8 gap-1.5 rounded-xl px-3 bg-card shadow-sm"
								onClick={() => {
									const filename =
										activeTab === "eve"
											? activeEveFile || "SKILL.md"
											: activeTab === "mcp_script"
												? "mcp_server.py"
												: "mcp_config.json";
									handleDownloadFile(filename, displayCode);
								}}
							>
								<Download className="h-3.5 w-3.5" />
								Download File
							</Button>
							<Button
								size="sm"
								className="text-xs h-8 gap-1.5 rounded-xl px-3 font-bold shadow-sm"
								onClick={handleDownloadFullBundle}
							>
								<Download className="h-3.5 w-3.5" />
								Full Bundle
							</Button>
							{skill.traceUrl && (
								<a href={skill.traceUrl} target="_blank" rel="noreferrer">
									<Button
										size="sm"
										variant="ghost"
										className="text-xs h-8 gap-1.5 rounded-xl px-3 text-muted-foreground hover:text-foreground"
									>
										<ExternalLink className="h-3.5 w-3.5" />
										LangSmith Trace
									</Button>
								</a>
							)}
						</div>
					</div>

					{/* Centered Full Text Display Container */}
					<div className="w-full rounded-2xl border border-border bg-card p-6 sm:p-8 font-mono text-xs sm:text-sm shadow-md overflow-x-auto text-left">
						<pre className="whitespace-pre-wrap text-foreground/90 leading-relaxed font-medium">
							{displayCode}
						</pre>
					</div>
				</div>

				{/* Workspace Footer Metas */}
				<Card className="border border-border/60 bg-muted/10">
					<CardFooter className="text-xs font-medium text-muted-foreground py-5 px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
						<div className="flex items-center">
							<div className="h-8 w-8 rounded-full bg-primary/25 flex items-center justify-center mr-3 border border-primary/30">
								<span className="text-xs text-primary font-bold">
									{(skill.authorId || "A")[0].toUpperCase()}
								</span>
							</div>
							Created by{" "}
							<span className="text-foreground ml-1 mr-2">
								{skill.authorId === "guest_user"
									? "You (Guest)"
									: skill.authorId}
							</span>{" "}
							• {new Date(skill.createdAt).toLocaleDateString()}
						</div>
						{skill.sourceUrl && (
							<div className="text-right truncate max-w-sm">
								Scraped Source URL:{" "}
								<a
									href={skill.sourceUrl}
									target="_blank"
									rel="noreferrer"
									className="text-primary font-semibold hover:underline truncate inline-block max-w-[200px] align-bottom"
								>
									{skill.sourceUrl}
								</a>
							</div>
						)}
					</CardFooter>
				</Card>
			</div>
		</div>
	);
}
