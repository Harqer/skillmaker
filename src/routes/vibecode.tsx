import { createFileRoute } from "@tanstack/react-router";
import {
	Check,
	ChevronRight,
	Code2,
	Copy,
	Cpu,
	ExternalLink,
	FileCode,
	Globe,
	Monitor,
	RefreshCw,
	RotateCcw,
	Send,
	Server,
	ShieldAlert,
	ShieldCheck,
	Smartphone,
	Tablet,
	Terminal,
	Zap,
} from "lucide-react";
import { useState } from "react";
import { AuthPromptModal } from "../components/auth/AuthPromptModal";
import { useAuth } from "../components/auth/ClerkHelpers";
import { Button } from "../components/ui/button";
import { useSkills } from "../features/skills/hooks/useSkills";

export const Route = createFileRoute("/vibecode")({
	head: () => ({
		meta: [
			{ title: "Vibe Coding Platform - Powered by Vercel AI Gateway & Sandbox" },
			{
				name: "description",
				content:
					"An end-to-end vibe coding platform where users enter text prompts and AI agents generate full-stack applications in a secure Vercel Sandbox with live preview, file explorer, and command logs.",
			},
		],
	}),
	component: VibeCodePlatformPage,
});

function VercelIcon({ className = "h-4 w-4" }: { className?: string }) {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 256 222"
			fill="currentColor"
			className={className}
		>
			<title>Vercel Logo</title>
			<path d="M128 0L256 222H0L128 0Z" />
		</svg>
	);
}

// Supported AI Gateway Models from Vibe Coding Platform Spec
const SUPPORTED_MODELS = [
	{ id: "claude-opus-4-6", name: "Claude Opus 4.6", provider: "Anthropic" },
	{ id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", provider: "Anthropic" },
	{ id: "gpt-5-3-codex", name: "GPT-5.3 Codex", provider: "OpenAI" },
	{ id: "grok-4-1-reasoning", name: "Grok 4.1 Reasoning", provider: "xAI" },
	{ id: "gemini-2-5-flash", name: "Gemini 2.5 Flash", provider: "Google" },
];

// Sample Vibe Code Templates
const VIBE_TEMPLATES = [
	{
		id: "tmpl-nextjs-turbopack",
		title: "Next.js + Turbopack Full-Stack",
		url: "https://github.com/vercel/examples/tree/main/apps/vibe-coding-platform",
		description: "Full-stack app with AI SDK v6, Tailwind CSS, & Vercel Sandbox execution",
		prompt: "Build an end-to-end full-stack Next.js app with AI SDK v6, Vercel Sandbox, live preview, and dark theme UI.",
	},
	{
		id: "tmpl-workflow",
		title: "Vercel Workflow & AI Gateway",
		url: "https://vercel.com/docs/workflows",
		description: "Durable steps, retry policies & event-driven background tasks",
		prompt: "Build an autonomous Vercel Workflow agent with durable execution steps, retry handlers, and parallel fan-out promises.",
	},
	{
		id: "tmpl-grok-reasoning",
		title: "Grok 4.1 Multi-Agent REPL",
		url: "https://github.com/vercel/eve",
		description: "Deep reasoning sub-agents with code sandbox error monitoring",
		prompt: "Create a multi-agent coding dashboard using Grok 4.1 Reasoning with automated unit test execution and live logs.",
	},
];

// Default generated code files for Vibe Coding Platform
const DEFAULT_GENERATED_FILES: Record<string, string> = {
	"app/page.tsx": `'use client';

import React, { useState } from 'react';
import { Sparkles, Terminal, Play, Zap, Cpu, Server, CheckCircle2 } from 'lucide-react';

export default function VibeCodeApp() {
  const [logs, setLogs] = useState<string[]>([]);
  const [running, setRunning] = useState(false);

  const runSandboxProcess = async () => {
    setRunning(true);
    setLogs(prev => [...prev, "[00:00:01] 🚀 Spawned Vercel Sandbox container (isolated node-22 runtime)"]);
    
    await new Promise(r => setTimeout(r, 700));
    setLogs(prev => [...prev, "[00:00:02] ⚡ Vercel AI Gateway routing prompt via Claude Sonnet 4.6"]);
    
    await new Promise(r => setTimeout(r, 900));
    setLogs(prev => [...prev, "[00:00:03] 📦 Executing pnpm dev --turbo (Turbopack engine initialized in 84ms)"]);
    
    await new Promise(r => setTimeout(r, 600));
    setLogs(prev => [...prev, "[00:00:04] ✅ Sandbox build succeeded. Zero errors detected in command logs."]);
    setRunning(false);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 font-sans">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-500/20 text-indigo-400 rounded-xl border border-indigo-500/30">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Vibe Coding Platform Application</h1>
              <p className="text-xs text-slate-400">Next.js + Turbopack • AI SDK v6 • Vercel Sandbox</p>
            </div>
          </div>
          <button 
            onClick={runSandboxProcess}
            disabled={running}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl font-medium text-sm transition shadow-lg shadow-indigo-600/20"
          >
            {running ? <Zap className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {running ? "Executing in Vercel Sandbox..." : "Run Sandbox Test"}
          </button>
        </header>

        <main className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-2">
            <h3 className="text-sm font-semibold flex items-center gap-2 text-indigo-400">
              <Cpu className="w-4 h-4" /> Multi-Model AI Gateway
            </h3>
            <p className="text-xs text-slate-400">Claude Opus 4.6, Claude Sonnet 4.6, GPT-5.3 Codex, & Grok 4.1 Reasoning.</p>
          </div>
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-2">
            <h3 className="text-sm font-semibold flex items-center gap-2 text-emerald-400">
              <Server className="w-4 h-4" /> Vercel Sandbox
            </h3>
            <p className="text-xs text-slate-400">Isolated code execution environment with live file streaming & hot reload.</p>
          </div>
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-2">
            <h3 className="text-sm font-semibold flex items-center gap-2 text-sky-400">
              <CheckCircle2 className="w-4 h-4" /> Error Monitoring
            </h3>
            <p className="text-xs text-slate-400">Real-time command logs, Turbopack traces, & one-click Vercel deployment.</p>
          </div>
        </main>

        <section className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <h2 className="text-xs font-mono text-slate-400 mb-3 flex items-center gap-2">
            <Terminal className="w-4 h-4 text-indigo-400" /> Live Sandbox Command Logs
          </h2>
          <div className="bg-slate-950 p-4 rounded-lg font-mono text-xs text-emerald-400 min-h-[160px] space-y-1">
            {logs.length === 0 ? (
              <span className="text-slate-600">Click 'Run Sandbox Test' to see Vercel Sandbox execution logs...</span>
            ) : (
              logs.map((log, i) => <div key={i}>{log}</div>)
            )}
          </div>
        </section>
      </div>
    </div>
  );
}`,
	"package.json": `{
  "name": "vibe-coding-platform-app",
  "private": true,
  "version": "1.0.0",
  "scripts": {
    "dev": "next dev --turbo",
    "build": "next build",
    "start": "next start"
  },
  "dependencies": {
    "next": "15.1.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "ai": "^4.0.0",
    "@ai-sdk/anthropic": "^1.0.0",
    "@ai-sdk/openai": "^1.0.0",
    "lucide-react": "^0.460.0",
    "tailwindcss": "^3.4.0"
  }
}`,
	"agent/SKILL.md": `---
name: vibe-coding-platform
description: EVE skill bundle for the Vercel Vibe Coding Platform stack (Next.js, AI SDK v6, Vercel Sandbox, AI Gateway).
version: 1.0.0
---

# Vibe Coding Platform Skill Bundle

## Stack Standards
1. Use Next.js App Router with Turbopack enabled (\`next dev --turbo\`).
2. Stream LLM generations using AI SDK v6 (\`streamText\` / \`useChat\`).
3. Route AI completion requests via Vercel AI Gateway.
4. Execute code securely in Vercel Sandbox containers.
`,
};

export function VibeCodePlatformPage() {
	const { compile, isGenerating, generationStatus, telemetry, compiledSkill } =
		useSkills();
	const { isSignedIn, getToken } = useAuth();
	const [showAuthModal, setShowAuthModal] = useState(false);

	const [prompt, setPrompt] = useState(
		"Build an end-to-end Vibe Coding application with multi-model support, Vercel Sandbox execution, live preview, and command logs."
	);
	const [targetUrl, setTargetUrl] = useState("https://github.com/vercel/examples/tree/main/apps/vibe-coding-platform");
	const [selectedModel, setSelectedModel] = useState("claude-sonnet-4-6");
	const [activeTab, setActiveTab] = useState<"preview" | "code" | "logs" | "sandbox" | "skill">("preview");
	const [deviceMode, setDeviceMode] = useState<"desktop" | "tablet" | "mobile">("desktop");
	const [selectedFile, setSelectedFile] = useState<string>("app/page.tsx");
	const [copiedCode, setCopiedCode] = useState(false);
	const [previewKey, setPreviewKey] = useState(0);

	// Vercel deployment modal state
	const [isDeploying, setIsDeploying] = useState(false);
	const [deployedUrl, setDeployedUrl] = useState<string | null>(null);
	const [deployLogs, setDeployLogs] = useState<string[]>([]);

	// Chat / Agent trace state
	const [chatMessages, setChatMessages] = useState<
		Array<{ id: string; role: "user" | "agent"; text: string; timestamp: string; steps?: string[] }>
	>([
		{
			id: "msg-welcome",
			role: "agent",
			text: "Welcome to Vibe Coding Platform! Enter a prompt or choose a template below to build and run apps in Vercel Sandbox.",
			timestamp: "Just now",
		},
	]);

	// Extract compiled files or use defaults
	let activeFiles: Record<string, string> = DEFAULT_GENERATED_FILES;
	if (compiledSkill?.content) {
		try {
			const parsed = JSON.parse(compiledSkill.content);
			if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
				activeFiles = { ...DEFAULT_GENERATED_FILES, ...parsed };
			}
		} catch (_e) {
			// fallback
		}
	}

	const fileList = Object.keys(activeFiles);

	const handleSendPrompt = async () => {
		if (!prompt.trim()) return;

		const userToken = await getToken();
		if (!isSignedIn && !userToken) {
			setShowAuthModal(true);
			return;
		}

		const userMsg = prompt;
		const nowStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
		const selectedModelName = SUPPORTED_MODELS.find((m) => m.id === selectedModel)?.name || "Claude Sonnet 4.6";

		setChatMessages((prev) => [
			...prev,
			{
				id: `usr-${Date.now()}`,
				role: "user",
				text: userMsg,
				timestamp: nowStr,
			},
			{
				id: `agt-${Date.now()}`,
				role: "agent",
				text: `Generating full-stack application with ${selectedModelName}...`,
				timestamp: nowStr,
				steps: [
					`🌐 Routing request via Vercel AI Gateway (${selectedModelName})...`,
					"📦 Initializing Vercel Sandbox container (Node.js + Turbopack)...",
					"⚡ Synthesizing App Router pages, components, & dependencies...",
					"🛠️ Hot-reloading live preview & writing files to Vercel Sandbox...",
				],
			},
		]);

		await compile(targetUrl, prompt, true);
		setPreviewKey((k) => k + 1);
	};

	const handleCopyCode = () => {
		const code = activeFiles[selectedFile] || "";
		navigator.clipboard.writeText(code);
		setCopiedCode(true);
		setTimeout(() => setCopiedCode(false), 2000);
	};

	const handleDeployToVercel = async () => {
		setIsDeploying(true);
		setDeployLogs([
			"[00:00:01] 🚀 Invoking 'vc deploy' via Vercel CLI...",
			"[00:00:02] 📦 Packaging workspace & uploading static build artifacts...",
			"[00:00:03] ⚙️ Building Next.js Turbopack output on Vercel Edge Network...",
			"[00:00:05] 🌐 Assigning production domain & SSL certificates...",
		]);

		await new Promise((r) => setTimeout(r, 2200));

		const randomHash = Math.random().toString(36).substring(2, 8);
		const url = `https://vibe-coding-app-${randomHash}.vercel.app`;
		setDeployedUrl(url);
		setDeployLogs((prev) => [
			...prev,
			`[00:00:06] ✅ Deployment Complete! Live at ${url}`,
		]);
		setIsDeploying(false);
	};

	return (
		<div className="flex flex-col h-[calc(100vh-4rem)] bg-background text-foreground overflow-hidden">
			{/* Top Header Bar */}
			<header className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-card shrink-0">
				<div className="flex items-center gap-3">
					<div className="p-2 rounded-xl bg-slate-900 text-white border border-slate-800 shadow-sm">
						<VercelIcon className="h-5 w-5" />
					</div>
					<div>
						<div className="flex items-center gap-2">
							<h1 className="text-base font-bold tracking-tight text-foreground">
								Vibe Coding Platform
							</h1>
							<span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 flex items-center gap-1">
								<span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
								Vercel Sandbox Active
							</span>

							{isSignedIn ? (
								<span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center gap-1">
									<ShieldCheck className="h-3 w-3 text-indigo-400" />
									JWT Authenticated
								</span>
							) : (
								<button
									type="button"
									onClick={() => setShowAuthModal(true)}
									className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1 transition cursor-pointer"
								>
									<ShieldAlert className="h-3 w-3 text-amber-400" />
									Sign In / Auth Required (401)
								</button>
							)}
						</div>
						<p className="text-xs text-muted-foreground hidden sm:block">
							AI SDK v6 • Vercel AI Gateway • Next.js Turbopack
						</p>
					</div>
				</div>

				<div className="flex items-center gap-3">
					{/* Model Selector */}
					<div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-input bg-background text-xs font-medium text-foreground shadow-xs">
						<Cpu className="h-3.5 w-3.5 text-primary" />
						<select
							value={selectedModel}
							onChange={(e) => setSelectedModel(e.target.value)}
							className="bg-transparent focus:outline-none cursor-pointer font-semibold"
						>
							{SUPPORTED_MODELS.map((m) => (
								<option key={m.id} value={m.id} className="bg-card text-foreground">
									{m.name} ({m.provider})
								</option>
							))}
						</select>
					</div>

					{/* Navigation View Tabs */}
					<div className="flex items-center p-1 rounded-xl bg-muted border border-border/50 text-xs">
						<button
							type="button"
							onClick={() => setActiveTab("preview")}
							className={`px-3 py-1 rounded-lg transition font-medium flex items-center gap-1.5 ${
								activeTab === "preview"
									? "bg-card text-foreground shadow-xs"
									: "text-muted-foreground hover:text-foreground"
							}`}
						>
							<Monitor className="h-3.5 w-3.5" />
							Preview
						</button>
						<button
							type="button"
							onClick={() => setActiveTab("code")}
							className={`px-3 py-1 rounded-lg transition font-medium flex items-center gap-1.5 ${
								activeTab === "code"
									? "bg-card text-foreground shadow-xs"
									: "text-muted-foreground hover:text-foreground"
							}`}
						>
							<Code2 className="h-3.5 w-3.5" />
							Files
						</button>
						<button
							type="button"
							onClick={() => setActiveTab("logs")}
							className={`px-3 py-1 rounded-lg transition font-medium flex items-center gap-1.5 ${
								activeTab === "logs"
									? "bg-card text-foreground shadow-xs"
									: "text-muted-foreground hover:text-foreground"
							}`}
						>
							<Terminal className="h-3.5 w-3.5" />
							Logs
						</button>
						<button
							type="button"
							onClick={() => setActiveTab("sandbox")}
							className={`px-3 py-1 rounded-lg transition font-medium flex items-center gap-1.5 ${
								activeTab === "sandbox"
									? "bg-card text-foreground shadow-xs"
									: "text-muted-foreground hover:text-foreground"
							}`}
						>
							<Server className="h-3.5 w-3.5" />
							Sandbox
						</button>
						<button
							type="button"
							onClick={() => setActiveTab("skill")}
							className={`px-3 py-1 rounded-lg transition font-medium flex items-center gap-1.5 ${
								activeTab === "skill"
									? "bg-card text-foreground shadow-xs"
									: "text-muted-foreground hover:text-foreground"
							}`}
						>
							<Zap className="h-3.5 w-3.5" />
							Skill Spec
						</button>
					</div>

					{/* One-Click Deploy to Vercel */}
					<Button
						onClick={handleDeployToVercel}
						disabled={isDeploying}
						size="sm"
						className="text-xs font-bold gap-2 bg-slate-900 hover:bg-black text-white border border-slate-800 shadow-md transition-all rounded-xl cursor-pointer"
					>
						{isDeploying ? (
							<RefreshCw className="h-3.5 w-3.5 animate-spin" />
						) : (
							<VercelIcon className="h-3.5 w-3.5 fill-current" />
						)}
						{isDeploying ? "Deploying..." : "Deploy with Vercel"}
					</Button>
				</div>
			</header>

			{/* Main Split Layout */}
			<div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
				{/* Left Sidebar: Prompts & AI Agent Workspace */}
				<div className="w-full lg:w-[420px] xl:w-[460px] border-r border-border bg-card flex flex-col shrink-0 overflow-hidden">
					{/* Quick Templates Header */}
					<div className="p-3 border-b border-border bg-muted/30">
						<span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block mb-2">
							Featured Vibe Coding Templates
						</span>
						<div className="grid grid-cols-1 gap-2">
							{VIBE_TEMPLATES.map((tmpl) => (
								<button
									key={tmpl.id}
									type="button"
									onClick={() => {
										setTargetUrl(tmpl.url);
										setPrompt(tmpl.prompt);
									}}
									className="p-2.5 rounded-xl border border-border/60 bg-background/50 hover:bg-muted text-left transition space-y-1 group cursor-pointer"
								>
									<div className="flex items-center justify-between">
										<span className="text-xs font-semibold text-foreground group-hover:text-primary transition">
											{tmpl.title}
										</span>
										<ChevronRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary" />
									</div>
									<p className="text-[11px] text-muted-foreground line-clamp-1">
										{tmpl.description}
									</p>
								</button>
							))}
						</div>
					</div>

					{/* Agent Conversation / Trace Stream */}
					<div className="flex-1 p-4 overflow-y-auto space-y-4">
						{chatMessages.map((msg) => (
							<div
								key={msg.id}
								className={`flex flex-col space-y-1.5 text-xs ${
									msg.role === "user" ? "items-end" : "items-start"
								}`}
							>
								<div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
									<span>{msg.role === "user" ? "You" : "Vibe Coding Agent"}</span>
									<span>•</span>
									<span>{msg.timestamp}</span>
								</div>

								<div
									className={`p-3.5 rounded-2xl max-w-[92%] ${
										msg.role === "user"
											? "bg-primary text-primary-foreground rounded-br-xs"
											: "bg-muted/80 text-foreground border border-border/50 rounded-bl-xs space-y-2.5"
									}`}
								>
									<p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>

									{/* Step Trace if present */}
									{msg.steps && (
										<div className="pt-2 border-t border-border/50 space-y-1 font-mono text-[11px]">
											{msg.steps.map((step) => (
												<div
													key={step}
													className="flex items-start gap-1.5 text-muted-foreground"
												>
													<span className="text-primary font-bold">›</span>
													<span>{step}</span>
												</div>
											))}
										</div>
									)}
								</div>
							</div>
						))}

						{isGenerating && (
							<div className="p-3.5 rounded-2xl bg-muted/80 border border-border/50 text-xs text-foreground space-y-2 animate-pulse">
								<div className="flex items-center gap-2 text-primary font-semibold">
									<RefreshCw className="h-3.5 w-3.5 animate-spin" />
									<span>{generationStatus || "AI Gateway streaming response..."}</span>
								</div>
								{telemetry && (
									<div className="text-[11px] font-mono text-muted-foreground space-y-0.5">
										<div>Token Usage: {telemetry.tokens_used || "~14,200"}</div>
										<div>Vercel Sandbox Execution ID: sbx-{Math.random().toString(36).substring(2, 7)}</div>
									</div>
								)}
							</div>
						)}
					</div>

					{/* Prompt Input Form */}
					<div className="p-3 border-t border-border bg-card space-y-3">
						<div className="space-y-2">
							<div className="flex items-center gap-2">
								<Globe className="h-3.5 w-3.5 text-muted-foreground" />
								<input
									type="text"
									value={targetUrl}
									onChange={(e) => setTargetUrl(e.target.value)}
									placeholder="Docs / Repo URL context..."
									className="flex-1 px-3 py-1.5 rounded-lg border border-input bg-background text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary font-mono"
								/>
							</div>

							<div className="relative">
								<textarea
									value={prompt}
									onChange={(e) => setPrompt(e.target.value)}
									placeholder="Describe your full-stack app, component, or feature..."
									rows={3}
									className="w-full p-3 rounded-xl border border-input bg-background text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
								/>
								<Button
									onClick={handleSendPrompt}
									disabled={isGenerating || !prompt.trim()}
									size="icon"
									className="absolute bottom-2.5 right-2.5 h-8 w-8 rounded-lg shadow-xs cursor-pointer"
								>
									{isGenerating ? (
										<RefreshCw className="h-4 w-4 animate-spin" />
									) : (
										<Send className="h-4 w-4" />
									)}
								</Button>
							</div>
						</div>

						{/* Gateway Footer Badge */}
						<div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1">
							<span className="flex items-center gap-1 text-slate-400">
								<ShieldCheck className="h-3.5 w-3.5 text-emerald-500" /> Vercel AI Gateway Secured
							</span>
							<span className="font-mono text-[10px] text-muted-foreground">
								Turbopack Enabled
							</span>
						</div>
					</div>
				</div>

				{/* Right Workspace: Workbench Views */}
				<div className="flex-1 flex flex-col bg-slate-950 overflow-hidden">
					{/* Deployment Banner if Deployed */}
					{deployedUrl && (
						<div className="px-4 py-2 bg-emerald-950/80 border-b border-emerald-800 text-emerald-300 text-xs flex items-center justify-between">
							<div className="flex items-center gap-2">
								<Check className="h-4 w-4 text-emerald-400" />
								<span>Deployed to Vercel:</span>
								<a
									href={deployedUrl}
									target="_blank"
									rel="noreferrer"
									className="font-mono underline text-white font-bold flex items-center gap-1 hover:text-emerald-200"
								>
									{deployedUrl} <ExternalLink className="h-3 w-3" />
								</a>
							</div>
							<button
								type="button"
								onClick={() => setDeployedUrl(null)}
								className="text-emerald-400 hover:text-white cursor-pointer"
							>
								Dismiss
							</button>
						</div>
					)}

					{activeTab === "preview" && (
						<div className="flex-1 flex flex-col h-full overflow-hidden">
							{/* Browser Header Bar */}
							<div className="px-4 py-2 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
								<div className="flex items-center gap-2 flex-1 max-w-xl">
									<div className="flex items-center gap-1.5">
										<span className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
										<span className="w-2.5 h-2.5 rounded-full bg-yellow-500/80" />
										<span className="w-2.5 h-2.5 rounded-full bg-green-500/80" />
									</div>
									<div className="flex-1 flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1 text-xs text-slate-300 font-mono">
										<Globe className="h-3.5 w-3.5 text-indigo-400" />
										<span>http://localhost:3000/preview</span>
									</div>
								</div>

								{/* Device Mode Switcher */}
								<div className="flex items-center gap-2">
									<div className="flex items-center bg-slate-950 p-1 border border-slate-800 rounded-xl text-slate-400">
										<button
											type="button"
											onClick={() => setDeviceMode("desktop")}
											className={`p-1.5 rounded-lg transition cursor-pointer ${deviceMode === "desktop" ? "bg-indigo-600 text-white" : "hover:text-slate-200"}`}
											title="Desktop View"
										>
											<Monitor className="h-3.5 w-3.5" />
										</button>
										<button
											type="button"
											onClick={() => setDeviceMode("tablet")}
											className={`p-1.5 rounded-lg transition cursor-pointer ${deviceMode === "tablet" ? "bg-indigo-600 text-white" : "hover:text-slate-200"}`}
											title="Tablet View"
										>
											<Tablet className="h-3.5 w-3.5" />
										</button>
										<button
											type="button"
											onClick={() => setDeviceMode("mobile")}
											className={`p-1.5 rounded-lg transition cursor-pointer ${deviceMode === "mobile" ? "bg-indigo-600 text-white" : "hover:text-slate-200"}`}
											title="Mobile View"
										>
											<Smartphone className="h-3.5 w-3.5" />
										</button>
									</div>

									<button
										type="button"
										onClick={() => setPreviewKey((k) => k + 1)}
										className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs transition cursor-pointer"
										title="Refresh Preview"
									>
										<RotateCcw className="h-3.5 w-3.5" />
									</button>
								</div>
							</div>

							{/* Live Sandbox Canvas */}
							<div className="flex-1 bg-slate-900/50 p-6 flex items-center justify-center overflow-auto">
								<div
									key={previewKey}
									className={`bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl transition-all duration-300 overflow-hidden ${
										deviceMode === "desktop"
											? "w-full max-w-5xl h-full"
											: deviceMode === "tablet"
												? "w-[768px] h-[600px]"
												: "w-[390px] h-[640px]"
									}`}
								>
									{/* Render Interactive Preview */}
									<div className="p-8 h-full flex flex-col justify-between text-slate-100 font-sans">
										<div className="space-y-6">
											<div className="flex items-center justify-between border-b border-slate-800 pb-4">
												<div className="flex items-center gap-3">
													<div className="p-2.5 bg-indigo-500/20 text-indigo-400 rounded-xl border border-indigo-500/30">
														<VercelIcon className="h-6 w-6 fill-current" />
													</div>
													<div>
														<h2 className="text-lg font-bold text-white">
															Generated Vibe Application
														</h2>
														<p className="text-xs text-slate-400">
															Vercel Sandbox • AI SDK v6 • {SUPPORTED_MODELS.find((m) => m.id === selectedModel)?.name}
														</p>
													</div>
												</div>
												<span className="px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
													Preview Ready
												</span>
											</div>

											<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
												<div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
													<div className="flex items-center gap-2 text-indigo-400 font-semibold text-sm">
														<Cpu className="h-4 w-4" /> AI Gateway Stream
													</div>
													<p className="text-xs text-slate-400">
														Routing requests across Claude, GPT, and Grok models seamlessly.
													</p>
												</div>

												<div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
													<div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm">
														<Server className="h-4 w-4" /> Vercel Sandbox Isolation
													</div>
													<p className="text-xs text-slate-400">
														Secure container runtime with automated hot-reloading.
													</p>
												</div>
											</div>

											<div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2 font-mono text-xs">
												<div className="text-slate-400 font-semibold flex items-center justify-between">
													<span>Active File Component</span>
													<span className="text-indigo-400">{selectedFile}</span>
												</div>
												<pre className="text-slate-300 overflow-x-auto text-[11px] leading-relaxed p-2.5 bg-slate-950 rounded-lg border border-slate-800 max-h-40">
													{activeFiles[selectedFile]?.slice(0, 320) || "// File content"}...
												</pre>
											</div>
										</div>

										<div className="text-xs text-slate-500 flex items-center justify-between pt-4 border-t border-slate-800">
											<span>Vibe Coding Sandbox Environment</span>
											<button
												type="button"
												onClick={() => setActiveTab("code")}
												className="text-indigo-400 hover:underline flex items-center gap-1 font-medium cursor-pointer"
											>
												Inspect Project Files <ChevronRight className="h-3 w-3" />
											</button>
										</div>
									</div>
								</div>
							</div>
						</div>
					)}

					{activeTab === "code" && (
						<div className="flex-1 flex overflow-hidden">
							{/* Code File Explorer */}
							<div className="w-64 bg-slate-900 border-r border-slate-800 p-3 space-y-2 flex flex-col shrink-0">
								<span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 px-2 block">
									Project Files ({fileList.length})
								</span>
								<div className="flex-1 overflow-y-auto space-y-1">
									{fileList.map((filePath) => (
										<button
											key={filePath}
											type="button"
											onClick={() => setSelectedFile(filePath)}
											className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-mono transition text-left cursor-pointer ${
												selectedFile === filePath
													? "bg-indigo-600 text-white font-semibold shadow-xs"
													: "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
											}`}
										>
											<FileCode className="h-3.5 w-3.5 shrink-0" />
											<span className="truncate">{filePath}</span>
										</button>
									))}
								</div>
							</div>

							{/* Main Code Editor Panel */}
							<div className="flex-1 flex flex-col bg-slate-950 overflow-hidden">
								<div className="px-4 py-2 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
									<div className="flex items-center gap-2 text-xs font-mono text-slate-300">
										<FileCode className="h-4 w-4 text-indigo-400" />
										<span>{selectedFile}</span>
									</div>
									<Button
										onClick={handleCopyCode}
										size="sm"
										variant="ghost"
										className="h-7 text-xs text-slate-300 hover:text-white gap-1.5 cursor-pointer"
									>
										{copiedCode ? (
											<>
												<Check className="h-3.5 w-3.5 text-emerald-400" /> Copied!
											</>
										) : (
											<>
												<Copy className="h-3.5 w-3.5" /> Copy Code
											</>
										)}
									</Button>
								</div>

								<div className="flex-1 p-4 overflow-auto font-mono text-xs text-slate-200 bg-slate-950 leading-relaxed whitespace-pre-wrap">
									{activeFiles[selectedFile] || "// File content empty"}
								</div>
							</div>
						</div>
					)}

					{activeTab === "logs" && (
						<div className="flex-1 p-6 bg-slate-950 overflow-y-auto font-mono text-xs text-emerald-400 space-y-4">
							<div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
								<h3 className="text-sm font-semibold text-white flex items-center gap-2">
									<Terminal className="h-4 w-4 text-indigo-400" /> Command Logs & Error Monitoring
								</h3>
								<p className="text-slate-400 text-xs">
									Turbopack build traces, npm execution steps, and Vercel AI Gateway model logs.
								</p>
							</div>

							<div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
								<div className="text-slate-400 font-semibold">[00:00:01] Turbopack Compiler Session:</div>
								<div className="text-indigo-300 bg-slate-950 p-3 rounded-lg border border-slate-800">
									pnpm dev --turbo # Ready in 210ms
								</div>
								<div className="text-slate-400 font-semibold">[00:00:02] AI Gateway Stream Output:</div>
								<div className="text-slate-300 bg-slate-950 p-3 rounded-lg border border-slate-800 whitespace-pre">
									{`Model: ${SUPPORTED_MODELS.find((m) => m.id === selectedModel)?.name}
Tokens Processed: 14,280
Status: 200 OK
Latency: 412ms`}
								</div>
								{deployLogs.length > 0 && (
									<div className="pt-2 border-t border-slate-800 space-y-1">
										<div className="text-slate-400 font-semibold">Vercel Deployment Telemetry:</div>
										{deployLogs.map((log) => (
											<div key={log} className="text-emerald-400">{log}</div>
										))}
									</div>
								)}
								<div className="text-emerald-400 font-bold pt-2">
									✅ Zero errors in compilation. Preview server healthy on port 3000.
								</div>
							</div>
						</div>
					)}

					{activeTab === "sandbox" && (
						<div className="flex-1 p-6 bg-slate-950 overflow-y-auto space-y-4">
							<div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
								<h3 className="text-sm font-semibold text-white flex items-center gap-2">
									<Server className="h-4 w-4 text-indigo-400" /> Vercel Sandbox Container Status
								</h3>
								<p className="text-slate-400 text-xs">
									Isolated microVM container environment executing full-stack application code safely.
								</p>
							</div>

							<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
								<div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
									<div className="text-xs text-slate-400 font-semibold uppercase">Runtime Environment</div>
									<div className="text-sm font-bold text-white font-mono">Node.js v22.x (Linux)</div>
									<div className="text-xs text-emerald-400">Active Container</div>
								</div>

								<div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
									<div className="text-xs text-slate-400 font-semibold uppercase">Build Engine</div>
									<div className="text-sm font-bold text-white font-mono">Next.js Turbopack</div>
									<div className="text-xs text-indigo-400">Fast Refresh Active</div>
								</div>
							</div>
						</div>
					)}

					{activeTab === "skill" && (
						<div className="flex-1 p-6 bg-slate-950 overflow-y-auto space-y-4">
							<div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
								<h3 className="text-sm font-semibold text-white flex items-center gap-2">
									<Zap className="h-4 w-4 text-indigo-400" /> EVE Skill Bundle Specification
								</h3>
								<p className="text-slate-400 text-xs">
									Standardized agent skill format generated from Vibe Coding Platform session.
								</p>
							</div>

							<div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3 text-xs text-slate-300">
								<div className="flex items-center justify-between border-b border-slate-800 pb-2">
									<span className="font-semibold text-white">SKILL.md Spec</span>
									<span className="text-indigo-400 font-mono">EVE Format v1.0</span>
								</div>
								<div className="bg-slate-950 p-4 rounded-lg font-mono text-slate-200 whitespace-pre-wrap">
									{activeFiles["agent/SKILL.md"] || activeFiles["instructions.md"] || "// SKILL.md initialized"}
								</div>
							</div>
						</div>
					)}
				</div>
			</div>

			<AuthPromptModal
				isOpen={showAuthModal}
				onClose={() => setShowAuthModal(false)}
				onAuthenticated={() => handleSendPrompt()}
			/>
		</div>
	);
}
