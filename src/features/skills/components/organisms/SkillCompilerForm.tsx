import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "@tanstack/react-router";
import {
	Brain,
	Check,
	ChevronDown,
	ChevronUp,
	Copy,
	Download,
	ExternalLink,
	FileCode,
	Link2,
	Send,
	Terminal,
} from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { useSkills } from "../../hooks/useSkills";
import { LoadingSpinner } from "../atoms/LoadingSpinner";

const formSchema = z.object({
	url: z
		.string()
		.min(1, "Please enter a URL, repo, or skills command (e.g., npx skills add vercel/eve)"),
	include_mcp: z.boolean().default(false),
});

type FormValues = z.infer<typeof formSchema>;

export function SkillCompilerForm() {
	const {
		compile,
		isGenerating,
		generationStatus,
		telemetry,
		compiledSkill,
		error,
		clearError,
	} = useSkills();

	const [selectedFileKey, setSelectedFileKey] = useState<string>("");
	const [copiedCode, setCopiedCode] = useState(false);
	const [copiedFullBundle, setCopiedFullBundle] = useState(false);
	const [showLogs, setShowLogs] = useState(false);

	const {
		register,
		handleSubmit,
		formState: { errors },
	} = useForm<FormValues>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			url: "",
			include_mcp: false,
		},
	});

	const onSubmit = async (values: FormValues) => {
		clearError();
		let targetUrl = values.url.trim();

		if (targetUrl.toLowerCase().startsWith("npx skills add ")) {
			targetUrl = targetUrl.replace(/^npx skills add\s+/i, "").trim();
		}
		if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
			if (targetUrl === "vercel/eve") {
				targetUrl = "https://vercel.com/docs/eve";
			} else if (targetUrl === "vercel/workflow") {
				targetUrl = "https://vercel.com/docs/workflows";
			} else if (targetUrl.includes("/")) {
				targetUrl = `https://github.com/${targetUrl}`;
			} else {
				targetUrl = `https://github.com/vercel/${targetUrl}`;
			}
		}

		await compile(targetUrl, undefined, values.include_mcp);
	};

	// Parse compiled skill files if present
	let parsedEveFiles: Record<string, string> | null = null;
	if (compiledSkill?.content) {
		try {
			const obj = JSON.parse(compiledSkill.content);
			if (typeof obj === "object" && obj !== null && !Array.isArray(obj)) {
				parsedEveFiles = obj;
			}
		} catch (_e) {
			parsedEveFiles = null;
		}
	}

	const eveFileKeys = parsedEveFiles ? Object.keys(parsedEveFiles) : [];
	const activeFile =
		selectedFileKey && eveFileKeys.includes(selectedFileKey)
			? selectedFileKey
			: eveFileKeys.includes("instructions.md")
				? "instructions.md"
				: eveFileKeys[0] || "";

	const activeFileContent =
		parsedEveFiles && activeFile
			? parsedEveFiles[activeFile]
			: compiledSkill?.content || "";

	const handleCopyActiveFile = async () => {
		if (!activeFileContent) return;
		try {
			await navigator.clipboard.writeText(activeFileContent);
			setCopiedCode(true);
			setTimeout(() => setCopiedCode(false), 2000);
		} catch (err) {
			console.error("Failed to copy code:", err);
		}
	};

	const handleCopyFullBundle = async () => {
		if (!compiledSkill) return;
		try {
			let fullText = `# ${compiledSkill.title}\n${compiledSkill.description}\n\n`;
			if (parsedEveFiles) {
				for (const [fn, code] of Object.entries(parsedEveFiles)) {
					fullText += `--- FILE: ${fn} ---\n${code}\n\n`;
				}
			} else {
				fullText += compiledSkill.content;
			}
			await navigator.clipboard.writeText(fullText);
			setCopiedFullBundle(true);
			setTimeout(() => setCopiedFullBundle(false), 2000);
		} catch (err) {
			console.error("Failed to copy full bundle:", err);
		}
	};

	const handleDownloadActiveFile = () => {
		if (!activeFileContent || !activeFile) return;
		const parts = activeFile.split("/");
		const filename = parts[parts.length - 1] || activeFile;
		const element = document.createElement("a");
		const file = new Blob([activeFileContent], {
			type: "text/plain;charset=utf-8",
		});
		element.href = URL.createObjectURL(file);
		element.download = filename;
		document.body.appendChild(element);
		element.click();
		document.body.removeChild(element);
	};

	const handleDownloadFullBundle = () => {
		if (!compiledSkill) return;
		const bundle = parsedEveFiles || { "SKILL.md": compiledSkill.content };
		if (compiledSkill.mcpScript)
			bundle["mcp_server.py"] = compiledSkill.mcpScript;
		if (compiledSkill.mcpConfig)
			bundle["mcp_config.json"] = compiledSkill.mcpConfig;

		const payload = JSON.stringify(bundle, null, 2);
		const element = document.createElement("a");
		const file = new Blob([payload], {
			type: "application/json;charset=utf-8",
		});
		element.href = URL.createObjectURL(file);
		const safeTitle = compiledSkill.title
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-");
		element.download = `${safeTitle}-eve-skill-bundle.json`;
		document.body.appendChild(element);
		element.click();
		document.body.removeChild(element);
	};

	// CoT list fallback / stream items
	const cotList =
		telemetry?.chainOfThought && telemetry.chainOfThought.length > 0
			? telemetry.chainOfThought
			: [
					"Initializing multi-stage Raven Deep Research & SkillOpt pipeline.",
					"Streaming Markdown documentation & code snippets...",
					"Generating Vector Embeddings & scanning official skill signatures...",
					"Mining trajectory logs & formatting EVE Skill Bundle with Gemini 2.5...",
					"Finalizing Redis Iris context layer & verifying compilation...",
				];

	const logsList = telemetry?.logs || [];

	return (
		<div className="flex flex-col items-center gap-6 w-full bg-card p-6 rounded-2xl border border-border/80 shadow-sm text-center mx-auto">
			{/* Input Form */}
			<form onSubmit={handleSubmit(onSubmit)} className="w-full space-y-3">
				<div className="relative flex flex-col md:flex-row items-stretch md:items-center w-full shadow-sm bg-background border border-border rounded-2xl md:rounded-full overflow-hidden focus-within:ring-2 focus-within:ring-primary/50 transition-all gap-2 md:gap-0 p-1 md:p-0">
					<div className="flex items-center flex-1">
						<div className="pl-4 text-muted-foreground">
							<Link2 className="h-4 w-4" />
						</div>
						<input
							id="url-compiler-input"
							type="text"
							placeholder="Enter URL or command (e.g. npx skills add vercel/eve or https://vercel.com/docs/eve)"
							disabled={isGenerating}
							{...register("url")}
							className="flex-1 bg-transparent border-none focus:ring-0 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground outline-none w-full"
						/>
					</div>

					<div className="flex items-center justify-between px-4 md:px-0 py-2 md:py-0 shrink-0 gap-4">
						<label className="flex items-center gap-2 text-xs font-medium text-muted-foreground select-none cursor-pointer hover:text-foreground transition-colors">
							<input
								type="checkbox"
								disabled={isGenerating}
								{...register("include_mcp")}
								className="rounded border-border text-primary focus:ring-primary/30 h-3.5 w-3.5"
							/>
							Generate MCP Tool
						</label>
						<div className="md:pr-1.5 md:py-1.5">
							<Button
								type="submit"
								disabled={isGenerating}
								size="sm"
								className="rounded-full px-5 bg-primary hover:bg-primary/95 text-primary-foreground transition-colors h-9 w-full md:w-auto font-semibold"
							>
								{isGenerating ? (
									<LoadingSpinner size="sm" />
								) : (
									<>
										<Send className="mr-1.5 h-3.5 w-3.5" />
										Make Skill
									</>
								)}
							</Button>
						</div>
					</div>
				</div>
				{errors.url && (
					<p className="text-xs text-destructive font-semibold px-2 text-center">
						{errors.url.message}
					</p>
				)}
			</form>

			{/* Live Chain of Thought Reasoning Feed when Generating / Polling */}
			{isGenerating && (
				<div className="w-full bg-background border border-primary/30 rounded-2xl p-5 shadow-sm space-y-4 text-left animate-in fade-in duration-300">
					<div className="flex items-center justify-between border-b border-border/60 pb-3">
						<div className="flex items-center gap-2.5">
							<div className="relative flex h-3 w-3">
								<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
								<span className="relative inline-flex rounded-full h-3 w-3 bg-primary" />
							</div>
							<span className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
								<Brain className="w-4 h-4" /> AI Chain of Thought Reasoning
							</span>
						</div>
						<span className="text-[11px] font-mono font-semibold text-muted-foreground bg-muted px-2.5 py-1 rounded-md">
							{generationStatus || "Reasoning..."}
						</span>
					</div>

					{/* Chain of Thought Steps List */}
					<div className="space-y-2.5 pt-1">
						{cotList.map((step, idx) => {
							const isLast = idx === cotList.length - 1;
							return (
								<div
									key={step}
									className={`flex items-start gap-3 p-2.5 rounded-xl text-xs transition-all ${
										isLast
											? "bg-primary/10 border border-primary/20 text-foreground font-medium shadow-xs"
											: "bg-muted/40 text-muted-foreground"
									}`}
								>
									<div
										className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 font-bold text-[10px] ${
											isLast
												? "bg-primary text-primary-foreground"
												: "bg-muted-foreground/20 text-muted-foreground"
										}`}
									>
										{isLast ? (
											<LoadingSpinner size="sm" />
										) : (
											<Check className="w-3 h-3" />
										)}
									</div>
									<span className="leading-relaxed flex-1 font-mono">
										{step}
									</span>
								</div>
							);
						})}
					</div>

					{/* Execution Logs Drawer */}
					{logsList.length > 0 && (
						<div className="pt-2 border-t border-border/50">
							<button
								type="button"
								onClick={() => setShowLogs(!showLogs)}
								className="flex items-center justify-between w-full text-[11px] font-mono font-semibold text-muted-foreground hover:text-foreground transition-colors py-1 cursor-pointer"
							>
								<span className="flex items-center gap-1.5">
									<Terminal className="w-3.5 h-3.5" /> Pipeline Telemetry Logs (
									{logsList.length})
								</span>
								{showLogs ? (
									<ChevronUp className="w-3.5 h-3.5" />
								) : (
									<ChevronDown className="w-3.5 h-3.5" />
								)}
							</button>

							{showLogs && (
								<div className="mt-2 rounded-xl bg-zinc-950 p-3 font-mono text-[11px] text-zinc-300 max-h-40 overflow-y-auto space-y-1">
									{logsList.map((log) => (
										<div
											key={log}
											className="text-emerald-400/90 whitespace-pre-wrap leading-tight"
										>
											{log}
										</div>
									))}
								</div>
							)}
						</div>
					)}
				</div>
			)}

			{/* Compiled Output Skill View */}
			{compiledSkill && !isGenerating && (
				<div className="w-full bg-card border border-border rounded-2xl p-5 shadow-sm space-y-5 text-left animate-in fade-in duration-300">
					{/* Header Info */}
					<div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border/60 pb-4">
						<div className="space-y-1.5">
							<div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
								<Check className="w-3.5 h-3.5" /> Skill Compiled & Ready
							</div>
							<h3 className="text-2xl font-bold font-serif text-foreground">
								{compiledSkill.title}
							</h3>
							<p className="text-xs text-muted-foreground max-w-xl">
								{compiledSkill.description}
							</p>

							{compiledSkill.tags && compiledSkill.tags.length > 0 && (
								<div className="flex flex-wrap gap-1.5 pt-1">
									{compiledSkill.tags.map((tag) => (
										<span
											key={tag}
											className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-muted text-muted-foreground border border-border/60"
										>
											{tag}
										</span>
									))}
								</div>
							)}
						</div>

						{/* Primary Action Buttons */}
						<div className="flex flex-wrap items-center gap-2 shrink-0">
							<Button
								size="sm"
								variant="outline"
								onClick={handleDownloadFullBundle}
								className="h-9 text-xs gap-1.5 font-medium rounded-xl border-border"
							>
								<Download className="w-3.5 h-3.5" />
								Download Bundle (.json)
							</Button>

							<Button
								size="sm"
								variant="outline"
								onClick={handleCopyFullBundle}
								className="h-9 text-xs gap-1.5 font-medium rounded-xl border-border"
							>
								{copiedFullBundle ? (
									<>
										<Check className="w-3.5 h-3.5 text-emerald-500" />
										Copied Bundle!
									</>
								) : (
									<>
										<Copy className="w-3.5 h-3.5" />
										Copy All
									</>
								)}
							</Button>

							<Link
								to="/skills/$skillId"
								params={{ skillId: compiledSkill.id }}
								className="inline-flex items-center gap-2 text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-xl transition-all shadow-sm h-9"
							>
								View Details
								<ExternalLink className="w-3.5 h-3.5" />
							</Link>
						</div>
					</div>

					{/* File Tabs & Code Inspector */}
					{eveFileKeys.length > 0 ? (
						<div className="space-y-3">
							<div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none border-b border-border/60">
								{eveFileKeys.map((fileKey) => (
									<button
										key={fileKey}
										type="button"
										onClick={() => setSelectedFileKey(fileKey)}
										className={`px-3 py-1.5 text-xs font-mono rounded-lg transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
											fileKey === activeFile
												? "bg-primary text-primary-foreground font-semibold shadow-sm"
												: "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
										}`}
									>
										<FileCode className="w-3.5 h-3.5" />
										{fileKey}
									</button>
								))}
							</div>

							<div className="relative rounded-xl border border-border bg-zinc-950 p-4 font-mono text-xs text-zinc-200 shadow-inner max-h-80 overflow-y-auto leading-relaxed">
								<div className="absolute right-3 top-3 flex items-center gap-2 z-10">
									<Button
										size="sm"
										variant="secondary"
										onClick={handleDownloadActiveFile}
										className="h-7 text-[11px] gap-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200"
									>
										<Download className="w-3 h-3" />
										Download
									</Button>

									<Button
										size="sm"
										variant="secondary"
										onClick={handleCopyActiveFile}
										className="h-7 text-[11px] gap-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200"
									>
										{copiedCode ? (
											<>
												<Check className="w-3 h-3 text-emerald-400" />
												Copied!
											</>
										) : (
											<>
												<Copy className="w-3 h-3" />
												Copy File
											</>
										)}
									</Button>
								</div>

								<pre className="whitespace-pre-wrap break-words text-emerald-300/90 pt-8">
									{activeFileContent}
								</pre>
							</div>
						</div>
					) : (
						<div className="relative rounded-xl border border-border bg-zinc-950 p-4 font-mono text-xs text-zinc-200 shadow-inner max-h-80 overflow-y-auto">
							<pre className="whitespace-pre-wrap break-words text-emerald-300/90">
								{compiledSkill.content}
							</pre>
						</div>
					)}
				</div>
			)}

			{error && !isGenerating && (
				<div className="p-3 bg-destructive/10 border border-destructive/25 text-destructive rounded-xl text-xs font-semibold w-full flex items-center justify-between">
					<span>{error}</span>
					<button
						type="button"
						onClick={clearError}
						className="text-xs underline hover:no-underline cursor-pointer"
					>
						Dismiss
					</button>
				</div>
			)}
		</div>
	);
}
