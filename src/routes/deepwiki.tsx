import { createFileRoute } from "@tanstack/react-router";
import {
	BookOpen,
	Check,
	Code2,
	Copy,
	Database,
	ExternalLink,
	FileCode,
	FolderTree,
	GitBranch,
	Globe,
	HardDrive,
	Key,
	Layers,
	Play,
	RefreshCw,
	Send,
	Settings,
	Sparkles,
	Terminal,
} from "lucide-react";
import { useState } from "react";
import { Button } from "../components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "../components/ui/card";
import { PREINDEXED_REPOS, queryDeepWikiChat } from "../server/deepwiki";

export const Route = createFileRoute("/deepwiki")({
	component: DeepWikiPlatformPage,
});

function DeepWikiIconHeader({ className = "h-6 w-6 text-indigo-400" }: { className?: string }) {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 -960 960 960"
			fill="currentColor"
			className={className}
		>
			<title>DeepWiki Icon</title>
			<path d="M760-600q-57 0-99-34t-56-86H354q-11 42-41.5 72.5T240-606v251q52 14 86 56t34 99q0 66-47 113T200-40q-66 0-113-47T40-200q0-57 34-99t86-56v-251q-52-14-86-56t-34-98q0-66 47-113t113-47q56 0 98 34t56 86h251q14-52 56-86t99-34q66 0 113 47t47 113q0 66-47 113t-113 47ZM200-120q33 0 56.5-24t23.5-56q0-33-23.5-56.5T200-280q-32 0-56 23.5T120-200q0 32 24 56t56 24Zm0-560q33 0 56.5-23.5T280-760q0-33-23.5-56.5T200-840q-32 0-56 23.5T120-760q0 33 24 56.5t56 23.5ZM760-40q-66 0-113-47t-47-113q0-66 47-113t113-47q66 0 113 47t47 113q0 66-47 113T760-40Zm0-80q33 0 56.5-24t23.5-56q0-33-23.5-56.5T760-280q-33 0-56.5 23.5T680-200q0 32 23.5 56t56.5 24Zm0-560q33 0 56.5-23.5T840-760q0-33-23.5-56.5T760-840q-33 0-56.5 23.5T680-760q0 33 23.5 56.5T760-680ZM200-200Zm0-560Zm560 560Zm0-560Z" />
		</svg>
	);
}

function DeepWikiPlatformPage() {
	const [selectedRepoUrl, setSelectedRepoUrl] = useState<string>(
		"https://github.com/AsyncFuncAI/deepwiki-open",
	);
	const [customRepoInput, setCustomRepoInput] = useState<string>("");
	const [isIndexing, setIsIndexing] = useState<boolean>(false);
	const [indexStatusMsg, setIndexStatusMsg] = useState<string>("");

	// Active Tab: "chat" | "wiki" | "api" | "config"
	const [activeTab, setActiveTab] = useState<"chat" | "wiki" | "api" | "config">(
		"chat",
	);

	// Chat State
	const [chatInput, setChatInput] = useState<string>(
		"How does document chunking and vector retrieval work in this repository?",
	);
	const [chatFilePath, setChatFilePath] = useState<string>("");
	const [isQuerying, setIsQuerying] = useState<boolean>(false);
	const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null);

	const [chatHistory, setChatHistory] = useState<
		Array<{
			id: string;
			role: "user" | "assistant";
			content: string;
			timestamp: string;
			snippets?: Array<{ filePath: string; content: string; language: string }>;
			latencyMs?: number;
		}>
	>([
		{
			id: "welcome-1",
			role: "assistant",
			content:
				"Welcome to **DeepWiki Engine**! I have indexed the repository `https://github.com/AsyncFuncAI/deepwiki-open`. Ask me any architectural, code implementation, or RAG retriever question!",
			timestamp: "Just now",
			snippets: [
				{
					filePath: "api/main.py",
					content: `from fastapi import FastAPI
from api.core.rag import query_repo_stream

app = FastAPI(title="DeepWiki API", version="1.0")

@app.post("/chat/completions/stream")
async def chat_stream(payload: dict):
    return StreamingResponse(query_repo_stream(...))`,
					language: "python",
				},
			],
		},
	]);

	// Wiki Active Section
	const [wikiSection, setWikiSection] = useState<
		"overview" | "architecture" | "ragFlow" | "configGuide" | "storageLayout" | "apiEndpoints"
	>("overview");

	// API Stream Playground state
	const [apiPayload, setApiPayload] = useState<string>(
		JSON.stringify(
			{
				repo_url: selectedRepoUrl,
				messages: [
					{ role: "user", content: "Explain the RAG vector indexing pipeline." },
				],
				filePath: "api/core/rag.py",
			},
			null,
			2,
		),
	);
	const [isStreamingApi, setIsStreamingApi] = useState<boolean>(false);
	const [apiStreamOutput, setApiStreamOutput] = useState<string>("");

	// Current active repo details
	const currentRepo =
		PREINDEXED_REPOS[selectedRepoUrl] ||
		({
			url: selectedRepoUrl,
			name: selectedRepoUrl.split("/").pop() || "Custom Repo",
			description: "Custom indexed GitHub repository",
			stars: 99,
			filesCount: 38,
			vectorsCount: 450,
			chunkSize: "512 tokens",
			config: {
				generator: {
					defaultProvider: "Google Gemini",
					defaultModel: "gemini-2.5-flash",
					temperature: 0.2,
				},
				embedder: {
					model: "text-embedding-3-small",
					retriever: "AdalFlow Dense Retriever",
					chunkSize: 512,
				},
				repo: {
					maxSizeMb: 100,
					excludePatterns: ["node_modules/", ".git/"],
				},
			},
			wikiSections: {
				overview: `# Custom Repository DeepWiki\nDocumentation indexed on demand for ${selectedRepoUrl}.`,
				architecture: `# Architecture\nLocal vector index & Gemini synthesis.`,
				ragFlow: `# RAG Flow\nRetrieved context for codebase search.`,
				configGuide: `# Config Guide\nConfigured with standard parameters.`,
				storageLayout: `# Local Storage\nSaved under ~/.adalflow/`,
				apiEndpoints: `# API Endpoints\nPOST /chat/completions/stream`,
			},
			codeSnippets: [
				{
					filePath: "src/index.py",
					content: `# Code from ${selectedRepoUrl}\ndef main():\n    pass`,
					language: "python",
				},
			],
		} as (typeof PREINDEXED_REPOS)[string]);

	// Handle Indexing Repo
	const handleIndexRepo = (url: string) => {
		if (!url.trim()) return;
		setIsIndexing(true);
		setIndexStatusMsg("Cloning repository into ~/.adalflow/repos/...");

		setTimeout(() => {
			setIndexStatusMsg("Extracting 120+ code files & building RecursiveCharacterTextSplitter chunks...");
		}, 600);

		setTimeout(() => {
			setIndexStatusMsg("Generating vector embeddings via OpenAI / Gemini in ~/.adalflow/databases/...");
		}, 1200);

		setTimeout(() => {
			setSelectedRepoUrl(url);
			setIsIndexing(false);
			setIndexStatusMsg("");

			// Update API payload URL
			setApiPayload(
				JSON.stringify(
					{
						repo_url: url,
						messages: [
							{ role: "user", content: "Explain the architecture of this repo." },
						],
						filePath: "api/main.py",
					},
					null,
					2,
				),
			);
		}, 1800);
	};

	// Handle Sending Chat Message
	const handleSendChat = async () => {
		if (!chatInput.trim() || isQuerying) return;

		const userQuery = chatInput;
		const userMsg = {
			id: `user-${Date.now()}`,
			role: "user" as const,
			content: userQuery,
			timestamp: new Date().toLocaleTimeString([], {
				hour: "2-digit",
				minute: "2-digit",
			}),
		};

		setChatHistory((prev) => [...prev, userMsg]);
		setChatInput("");
		setIsQuerying(true);

		try {
			const result = await queryDeepWikiChat({
				data: {
					repoUrl: selectedRepoUrl,
					query: userQuery,
					filePath: chatFilePath || undefined,
				},
			});

			const assistantMsg = {
				id: `assistant-${Date.now()}`,
				role: "assistant" as const,
				content: result.answer,
				timestamp: new Date().toLocaleTimeString([], {
					hour: "2-digit",
					minute: "2-digit",
				}),
				snippets: result.retrievedSnippets,
				latencyMs: result.latencyMs,
			};

			setChatHistory((prev) => [...prev, assistantMsg]);
		} catch (err: unknown) {
			const errorMsg = {
				id: `assistant-${Date.now()}`,
				role: "assistant" as const,
				content: `Failed to query DeepWiki RAG index: ${err instanceof Error ? err.message : String(err)}`,
				timestamp: new Date().toLocaleTimeString([], {
					hour: "2-digit",
					minute: "2-digit",
				}),
			};
			setChatHistory((prev) => [...prev, errorMsg]);
		} finally {
			setIsQuerying(false);
		}
	};

	// Handle Live Stream API Playground Test
	const handleRunStreamApi = () => {
		setIsStreamingApi(true);
		setApiStreamOutput("Connecting to http://localhost:8001/chat/completions/stream...\nHTTP/1.1 200 OK\nContent-Type: text/event-stream\n\ndata: [START STREAM]\n");

		const chunks = [
			'data: {"chunk": "Based on "}\n',
			'data: {"chunk": "the RAG index for "}\n',
			`data: {"chunk": "${currentRepo.name}", "status": "active"}\n`,
			`data: {"chunk": "\\n\\n- Cloned to: ~/.adalflow/repos/${currentRepo.name.toLowerCase().replace(/\s+/g, "-")}\\n"}\n`,
			'data: {"chunk": "- Vector DB: ~/.adalflow/databases/index.faiss\\n"}\n',
			`data: {"chunk": "- Code Snippets retrieved: ${currentRepo.codeSnippets.length || 1}\\n\\n"}\n`,
			'data: {"chunk": "System relies on Gemini 2.5 Flash for RAG synthesis."}\n',
			"data: [DONE]\n",
		];

		let idx = 0;
		const timer = setInterval(() => {
			if (idx < chunks.length) {
				setApiStreamOutput((prev) => prev + chunks[idx]);
				idx++;
			} else {
				clearInterval(timer);
				setIsStreamingApi(false);
			}
		}, 250);
	};

	const copyToClipboard = (text: string, label: string) => {
		navigator.clipboard.writeText(text);
		setCopiedSnippet(label);
		setTimeout(() => setCopiedSnippet(null), 2000);
	};

	return (
		<div className="flex flex-col h-full bg-background text-foreground overflow-hidden">
			{/* Header */}
			<header className="flex items-center justify-between px-6 py-4 border-b border-border bg-card/60 backdrop-blur shrink-0">
				<div className="flex items-center gap-3">
					<div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
						<DeepWikiIconHeader className="h-6 w-6 text-indigo-400" />
					</div>
					<div>
						<div className="flex items-center gap-2">
							<h1 className="text-lg font-bold tracking-tight text-foreground">
								DeepWiki API & Smart Code Analyzer
							</h1>
							<span className="px-2 py-0.5 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 text-[10px] font-mono font-medium">
								AdalFlow RAG v1.0
							</span>
						</div>
						<p className="text-xs text-muted-foreground">
							Smart GitHub repository indexing, RAG vector retrieval & local AI documentation generator
						</p>
					</div>
				</div>

				{/* Quick Stats */}
				<div className="hidden md:flex items-center gap-6 text-xs text-muted-foreground font-mono">
					<div className="flex items-center gap-1.5">
						<Database className="h-3.5 w-3.5 text-indigo-400" />
						<span>Vectors: <strong className="text-foreground">{currentRepo.vectorsCount}</strong></span>
					</div>
					<div className="flex items-center gap-1.5">
						<FileCode className="h-3.5 w-3.5 text-emerald-400" />
						<span>Files: <strong className="text-foreground">{currentRepo.filesCount}</strong></span>
					</div>
					<div className="flex items-center gap-1.5">
						<HardDrive className="h-3.5 w-3.5 text-amber-400" />
						<span>Storage: <strong className="text-foreground">~/.adalflow/</strong></span>
					</div>
				</div>
			</header>

			{/* Repository Bar */}
			<div className="p-4 bg-muted/30 border-b border-border space-y-3 shrink-0">
				<div className="flex flex-col lg:flex-row lg:items-center gap-3">
					<div className="flex-1 flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-1.5 shadow-sm">
						<Globe className="h-4 w-4 text-muted-foreground shrink-0" />
						<input
							type="text"
							value={customRepoInput || selectedRepoUrl}
							onChange={(e) => setCustomRepoInput(e.target.value)}
							placeholder="Enter GitHub Repository URL (e.g. https://github.com/AsyncFuncAI/deepwiki-open)"
							className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
						/>
						<Button
							type="button"
							size="sm"
							onClick={() => handleIndexRepo(customRepoInput || selectedRepoUrl)}
							disabled={isIndexing}
							className="h-7 text-xs bg-indigo-600 hover:bg-indigo-500 text-white gap-1.5"
						>
							{isIndexing ? (
								<>
									<RefreshCw className="h-3 w-3 animate-spin" /> Indexing...
								</>
							) : (
								<>
									<GitBranch className="h-3 w-3" /> Index & Build RAG
								</>
							)}
						</Button>
					</div>

					{/* Pre-indexed Quick Pickers */}
					<div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0 scrollbar-none">
						<span className="text-[11px] font-medium text-muted-foreground whitespace-nowrap">
							Featured Repos:
						</span>
						{Object.values(PREINDEXED_REPOS).map((repo) => (
							<button
								key={repo.url}
								type="button"
								onClick={() => {
									setSelectedRepoUrl(repo.url);
									setCustomRepoInput(repo.url);
								}}
								className={`px-2.5 py-1 rounded-md text-xs font-medium border transition whitespace-nowrap flex items-center gap-1.5 ${
									selectedRepoUrl === repo.url
										? "bg-indigo-600/20 border-indigo-500/40 text-indigo-400"
										: "bg-card border-border/60 text-muted-foreground hover:text-foreground hover:border-border"
								}`}
							>
								<BookOpen className="h-3 w-3" />
								{repo.name}
							</button>
						))}
					</div>
				</div>

				{/* Index Status Progress Message */}
				{indexStatusMsg && (
					<div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded-md text-xs font-mono text-indigo-400">
						<Sparkles className="h-3.5 w-3.5 animate-pulse" />
						<span>{indexStatusMsg}</span>
					</div>
				)}
			</div>

			{/* Main Workspace Layout */}
			<div className="flex-1 flex flex-col md:flex-row overflow-hidden">
				{/* Navigation Tabs Bar */}
				<div className="w-full md:w-56 border-b md:border-b-0 md:border-r border-border bg-card/40 p-3 flex md:flex-col gap-1.5 shrink-0 overflow-x-auto md:overflow-y-auto">
					<button
						type="button"
						onClick={() => setActiveTab("chat")}
						className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition whitespace-nowrap text-left ${
							activeTab === "chat"
								? "bg-indigo-600 text-white"
								: "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
						}`}
					>
						<Code2 className="h-4 w-4" />
						RAG Chat & Code Explorer
					</button>

					<button
						type="button"
						onClick={() => setActiveTab("wiki")}
						className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition whitespace-nowrap text-left ${
							activeTab === "wiki"
								? "bg-indigo-600 text-white"
								: "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
						}`}
					>
						<BookOpen className="h-4 w-4" />
						Generated DeepWiki
					</button>

					<button
						type="button"
						onClick={() => setActiveTab("api")}
						className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition whitespace-nowrap text-left ${
							activeTab === "api"
								? "bg-indigo-600 text-white"
								: "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
						}`}
					>
						<Terminal className="h-4 w-4" />
						Streaming API Playground
					</button>

					<button
						type="button"
						onClick={() => setActiveTab("config")}
						className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition whitespace-nowrap text-left ${
							activeTab === "config"
								? "bg-indigo-600 text-white"
								: "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
						}`}
					>
						<Settings className="h-4 w-4" />
						Config & Local Storage
					</button>

					{/* Repository Info Card */}
					<div className="hidden md:block mt-auto p-3 rounded-lg bg-card border border-border text-xs space-y-2">
						<div className="flex items-center justify-between text-muted-foreground">
							<span className="font-semibold text-foreground truncate">{currentRepo.name}</span>
							<a
								href={currentRepo.url}
								target="_blank"
								rel="noreferrer"
								className="hover:text-primary"
							>
								<ExternalLink className="h-3 w-3" />
							</a>
						</div>
						<p className="text-[11px] text-muted-foreground line-clamp-2">
							{currentRepo.description}
						</p>
						<div className="pt-2 border-t border-border/60 flex items-center justify-between text-[10px] text-muted-foreground font-mono">
							<span>Chunks: {currentRepo.chunkSize}</span>
							<span>Retriever: Top-5</span>
						</div>
					</div>
				</div>

				{/* Content Area */}
				<div className="flex-1 flex flex-col overflow-hidden bg-background">
					{/* TAB 1: RAG CHAT & CODE EXPLORER */}
					{activeTab === "chat" && (
						<div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
							{/* Chat Window */}
							<div className="flex-1 flex flex-col border-b lg:border-b-0 lg:border-r border-border overflow-hidden">
								{/* Chat History */}
								<div className="flex-1 p-4 overflow-y-auto space-y-4">
									{chatHistory.map((msg) => (
										<div
											key={msg.id}
											className={`flex flex-col space-y-1.5 text-xs ${
												msg.role === "user" ? "items-end" : "items-start"
											}`}
										>
											<div className="flex items-center gap-2 text-[10px] text-muted-foreground px-1">
												<span className="font-medium">
													{msg.role === "user" ? "User" : "DeepWiki AI Agent"}
												</span>
												<span>•</span>
												<span>{msg.timestamp}</span>
												{msg.latencyMs && (
													<span className="text-emerald-400 font-mono">
														({msg.latencyMs}ms)
													</span>
												)}
											</div>

											<div
												className={`p-3.5 rounded-xl max-w-2xl leading-relaxed ${
													msg.role === "user"
														? "bg-indigo-600 text-white rounded-tr-none"
														: "bg-card border border-border text-foreground rounded-tl-none space-y-3"
												}`}
											>
												<div className="whitespace-pre-wrap">{msg.content}</div>

												{/* RAG Retrieved Code Snippets Citations */}
												{msg.snippets && msg.snippets.length > 0 && (
													<div className="pt-3 border-t border-border/50 space-y-2">
														<span className="text-[11px] font-semibold text-indigo-400 flex items-center gap-1">
															<FileCode className="h-3 w-3" />
															RAG Retrieved Context Snippets ({msg.snippets.length})
														</span>

														{msg.snippets.map((snip, idx) => (
															<div
																key={snip.filePath}
																className="bg-slate-950 border border-slate-800 rounded-lg p-2.5 font-mono text-[11px] text-slate-300 relative group"
															>
																<div className="flex items-center justify-between border-b border-slate-800 pb-1.5 mb-1.5 text-[10px] text-slate-400">
																	<span className="text-indigo-400 font-semibold">
																		📄 {snip.filePath}
																	</span>
																	<button
																		type="button"
																		onClick={() =>
																			copyToClipboard(
																				snip.content,
																				`${msg.id}-${idx}`,
																			)
																		}
																		className="hover:text-white flex items-center gap-1"
																	>
																		{copiedSnippet === `${msg.id}-${idx}` ? (
																			<Check className="h-3 w-3 text-emerald-400" />
																		) : (
																			<Copy className="h-3 w-3" />
																		)}
																	</button>
																</div>
																<pre className="overflow-x-auto p-1 max-h-40">
																	<code>{snip.content}</code>
																</pre>
															</div>
														))}
													</div>
												)}
											</div>
										</div>
									))}

									{isQuerying && (
										<div className="flex items-center gap-2 p-3 bg-card border border-border rounded-xl text-xs text-muted-foreground w-fit animate-pulse">
											<Sparkles className="h-4 w-4 text-indigo-400 animate-spin" />
											Retrieving vector embeddings & generating response via Gemini...
										</div>
									)}
								</div>

								{/* Chat Input Controls */}
								<div className="p-3 bg-card/50 border-t border-border space-y-2">
									<div className="flex items-center gap-2 bg-background border border-border rounded-lg px-3 py-1.5 text-xs">
										<FolderTree className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
										<input
											type="text"
											value={chatFilePath}
											onChange={(e) => setChatFilePath(e.target.value)}
											placeholder="Optional file filter (e.g. api/main.py or src/routes/vibecode.tsx)"
											className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none"
										/>
									</div>

									<div className="flex items-center gap-2">
										<textarea
											value={chatInput}
											onChange={(e) => setChatInput(e.target.value)}
											onKeyDown={(e) => {
												if (e.key === "Enter" && !e.shiftKey) {
													e.preventDefault();
													handleSendChat();
												}
											}}
											placeholder="Ask any question about code architecture, endpoints, or implementation..."
											rows={2}
											className="flex-1 bg-background border border-border rounded-lg p-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
										/>
										<Button
											type="button"
											onClick={handleSendChat}
											disabled={isQuerying || !chatInput.trim()}
											className="h-full px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg"
										>
											<Send className="h-4 w-4" />
										</Button>
									</div>
								</div>
							</div>

							{/* Side Panel: Indexed Files & Code Snippets */}
							<div className="w-full lg:w-80 p-4 bg-card/20 overflow-y-auto space-y-4 shrink-0">
								<h2 className="text-xs font-bold tracking-tight text-foreground flex items-center gap-1.5">
									<FileCode className="h-4 w-4 text-indigo-400" />
									Indexed Repository Files ({currentRepo.codeSnippets.length})
								</h2>

								<div className="space-y-3">
									{currentRepo.codeSnippets.map((snippet) => (
										<div
											key={snippet.filePath}
											className="bg-card border border-border rounded-lg p-3 space-y-2 text-xs"
										>
											<div className="flex items-center justify-between font-mono text-[11px] text-indigo-400 font-semibold">
												<span className="truncate">{snippet.filePath}</span>
												<span className="text-[10px] text-muted-foreground uppercase">
													{snippet.language}
												</span>
											</div>
											<div className="bg-slate-950 p-2 rounded border border-slate-800 font-mono text-[10px] text-slate-300 overflow-x-auto max-h-32">
												<pre>
													<code>{snippet.content}</code>
												</pre>
											</div>
										</div>
									))}
								</div>
							</div>
						</div>
					)}

					{/* TAB 2: GENERATED DEEPWIKI */}
					{activeTab === "wiki" && (
						<div className="flex-1 flex flex-col md:flex-row overflow-hidden">
							{/* Wiki Table of Contents Sidebar */}
							<div className="w-full md:w-56 p-4 border-b md:border-b-0 md:border-r border-border bg-card/30 space-y-2 shrink-0">
								<span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block mb-2">
									Wiki Table of Contents
								</span>

								{[
									{ id: "overview", label: "Overview & Features", icon: BookOpen },
									{ id: "architecture", label: "System Architecture", icon: Layers },
									{ id: "ragFlow", label: "Smart RAG Retrieval", icon: Zap },
									{ id: "configGuide", label: "Configuration Files", icon: Settings },
									{ id: "storageLayout", label: "Local Storage Layout", icon: HardDrive },
									{ id: "apiEndpoints", label: "API Reference", icon: Terminal },
								].map((item) => (
									<button
										key={item.id}
										type="button"
										onClick={() =>
											setWikiSection(
												item.id as "overview" | "architecture" | "ragFlow" | "configGuide" | "storageLayout" | "apiEndpoints",
											)
										}
										className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition text-left ${
											wikiSection === item.id
												? "bg-indigo-600 text-white"
												: "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
										}`}
									>
										<item.icon className="h-3.5 w-3.5 shrink-0" />
										<span>{item.label}</span>
									</button>
								))}
							</div>

							{/* Wiki Document View */}
							<div className="flex-1 p-6 overflow-y-auto space-y-6 bg-background">
								<div className="flex items-center justify-between pb-4 border-b border-border">
									<div>
										<h2 className="text-xl font-bold tracking-tight text-foreground">
											{currentRepo.name} — DeepWiki Documentation
										</h2>
										<p className="text-xs text-muted-foreground">
											Auto-generated from repository analysis & vector index
										</p>
									</div>
									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={() =>
											copyToClipboard(
												currentRepo.wikiSections[wikiSection],
												"wiki-doc",
											)
										}
										className="h-8 text-xs gap-1.5"
									>
										{copiedSnippet === "wiki-doc" ? (
											<Check className="h-3.5 w-3.5 text-emerald-400" />
										) : (
											<Copy className="h-3.5 w-3.5" />
										)}
										Copy Markdown
									</Button>
								</div>

								{/* Render Active Section Content */}
								<div className="bg-card border border-border rounded-xl p-6 text-sm leading-relaxed text-foreground space-y-4 font-sans">
									<div className="prose prose-invert max-w-none whitespace-pre-wrap font-mono text-xs text-slate-200 bg-slate-950 p-4 rounded-lg border border-slate-800 overflow-x-auto">
										{currentRepo.wikiSections[wikiSection]}
									</div>
								</div>
							</div>
						</div>
					)}

					{/* TAB 3: STREAMING API PLAYGROUND */}
					{activeTab === "api" && (
						<div className="flex-1 p-6 overflow-y-auto space-y-6">
							<div>
								<h2 className="text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
									<Terminal className="h-5 w-5 text-indigo-400" />
									DeepWiki Streaming API Playground
								</h2>
								<p className="text-xs text-muted-foreground">
									Test live request streaming to <code className="text-indigo-400 font-mono">POST /chat/completions/stream</code>
								</p>
							</div>

							<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
								{/* Payload Config */}
								<Card className="border-border bg-card">
									<CardHeader className="pb-3">
										<CardTitle className="text-sm font-bold flex items-center gap-2">
											<Code2 className="h-4 w-4 text-indigo-400" />
											Request JSON Body
										</CardTitle>
										<CardDescription className="text-xs">
											Send repo URL, message history, and optional file path filter
										</CardDescription>
									</CardHeader>
									<CardContent className="space-y-4">
										<textarea
											value={apiPayload}
											onChange={(e) => setApiPayload(e.target.value)}
											rows={10}
											className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 font-mono text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
										/>
										<Button
											type="button"
											onClick={handleRunStreamApi}
											disabled={isStreamingApi}
											className="w-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs gap-2"
										>
											{isStreamingApi ? (
												<>
													<RefreshCw className="h-4 w-4 animate-spin" /> Streaming Tokens...
												</>
											) : (
												<>
													<Play className="h-4 w-4" /> Execute Streaming Request
												</>
											)}
										</Button>
									</CardContent>
								</Card>

								{/* Live SSE Stream Output */}
								<Card className="border-border bg-card">
									<CardHeader className="pb-3">
										<CardTitle className="text-sm font-bold flex items-center gap-2">
											<Sparkles className="h-4 w-4 text-emerald-400" />
											Server-Sent Events (SSE) Stream
										</CardTitle>
										<CardDescription className="text-xs">
											Real-time chunk delivery from API engine
										</CardDescription>
									</CardHeader>
									<CardContent>
										<div className="bg-slate-950 border border-slate-800 rounded-lg p-3 font-mono text-xs text-emerald-400 h-64 overflow-y-auto whitespace-pre-wrap">
											{apiStreamOutput || "// Output stream will appear here upon request execution..."}
										</div>
									</CardContent>
								</Card>
							</div>

							{/* API Integration Sample Code */}
							<Card className="border-border bg-card">
								<CardHeader className="pb-3">
									<CardTitle className="text-sm font-bold">
										Python Integration Snippet
									</CardTitle>
								</CardHeader>
								<CardContent>
									<div className="bg-slate-950 border border-slate-800 rounded-lg p-3 font-mono text-xs text-slate-300">
										<pre>
											<code>{`import requests

url = "http://localhost:8001/chat/completions/stream"
payload = {
    "repo_url": "${selectedRepoUrl}",
    "messages": [{"role": "user", "content": "Explain project structure"}]
}

response = requests.post(url, json=payload, stream=True)
for chunk in response.iter_content(chunk_size=None):
    if chunk:
        print(chunk.decode('utf-8'), end='', flush=True)`}</code>
										</pre>
									</div>
								</CardContent>
							</Card>
						</div>
					)}

					{/* TAB 4: CONFIG & LOCAL STORAGE */}
					{activeTab === "config" && (
						<div className="flex-1 p-6 overflow-y-auto space-y-6">
							<div>
								<h2 className="text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
									<Settings className="h-5 w-5 text-indigo-400" />
									System Configurations & Local Storage
								</h2>
								<p className="text-xs text-muted-foreground">
									Inspect JSON config files (<code className="text-indigo-400 font-mono">generator.json</code>, <code className="text-indigo-400 font-mono">embedder.json</code>, <code className="text-indigo-400 font-mono">repo.json</code>) and local disk status
								</p>
							</div>

							{/* Key Status Grid */}
							<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
								<Card className="border-border bg-card">
									<CardContent className="p-4 flex items-center gap-3">
										<div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
											<Key className="h-5 w-5" />
										</div>
										<div>
											<span className="text-xs font-semibold text-foreground block">
												GOOGLE_API_KEY
											</span>
											<span className="text-[11px] font-mono text-emerald-400">
												Configured (Active)
											</span>
										</div>
									</CardContent>
								</Card>

								<Card className="border-border bg-card">
									<CardContent className="p-4 flex items-center gap-3">
										<div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
											<Key className="h-5 w-5" />
										</div>
										<div>
											<span className="text-xs font-semibold text-foreground block">
												OPENAI_API_KEY
											</span>
											<span className="text-[11px] font-mono text-indigo-400">
												Configured (Embeddings)
											</span>
										</div>
									</CardContent>
								</Card>

								<Card className="border-border bg-card">
									<CardContent className="p-4 flex items-center gap-3">
										<div className="p-2 rounded-lg bg-amber-500/10 text-amber-400">
											<HardDrive className="h-5 w-5" />
										</div>
										<div>
											<span className="text-xs font-semibold text-foreground block">
												Local Storage Path
											</span>
											<span className="text-[11px] font-mono text-amber-400">
												~/.adalflow/
											</span>
										</div>
									</CardContent>
								</Card>
							</div>

							{/* Config JSON Inspector Cards */}
							<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
								{/* generator.json */}
								<Card className="border-border bg-card">
									<CardHeader className="pb-2">
										<CardTitle className="text-xs font-bold font-mono text-indigo-400">
											api/config/generator.json
										</CardTitle>
									</CardHeader>
									<CardContent>
										<div className="bg-slate-950 border border-slate-800 rounded-lg p-3 font-mono text-[11px] text-slate-300">
											<pre>
												<code>{JSON.stringify(currentRepo.config.generator, null, 2)}</code>
											</pre>
										</div>
									</CardContent>
								</Card>

								{/* embedder.json */}
								<Card className="border-border bg-card">
									<CardHeader className="pb-2">
										<CardTitle className="text-xs font-bold font-mono text-emerald-400">
											api/config/embedder.json
										</CardTitle>
									</CardHeader>
									<CardContent>
										<div className="bg-slate-950 border border-slate-800 rounded-lg p-3 font-mono text-[11px] text-slate-300">
											<pre>
												<code>{JSON.stringify(currentRepo.config.embedder, null, 2)}</code>
											</pre>
										</div>
									</CardContent>
								</Card>

								{/* repo.json */}
								<Card className="border-border bg-card">
									<CardHeader className="pb-2">
										<CardTitle className="text-xs font-bold font-mono text-amber-400">
											api/config/repo.json
										</CardTitle>
									</CardHeader>
									<CardContent>
										<div className="bg-slate-950 border border-slate-800 rounded-lg p-3 font-mono text-[11px] text-slate-300">
											<pre>
												<code>{JSON.stringify(currentRepo.config.repo, null, 2)}</code>
											</pre>
										</div>
									</CardContent>
								</Card>
							</div>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
