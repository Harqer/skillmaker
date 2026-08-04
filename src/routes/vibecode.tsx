import { createFileRoute } from "@tanstack/react-router";
import { Check, RefreshCw, ShieldAlert, ShieldCheck } from "lucide-react";
import { useCallback, useState } from "react";
import { VibeApp } from "@/components/vibe/app/vibe-app";
import { ChatProvider } from "@/components/vibe/chat-context";
import { ErrorMonitor } from "@/components/vibe/error-monitor/error-monitor";
import { AuthPromptModal } from "../components/auth/AuthPromptModal";
import { useAuth } from "../components/auth/ClerkHelpers";
import { Button } from "../components/ui/button";
import { useSkills } from "../features/skills/hooks/useSkills";

export const Route = createFileRoute("/vibecode")({
	head: () => ({
		meta: [
			{ title: "Vibe Coding Platform - Powered by AI Gateway & Local Sandbox" },
			{
				name: "description",
				content:
					"An end-to-end vibe coding platform where users enter text prompts and AI agents generate full-stack applications in a local sandbox with live preview, file explorer, and command logs.",
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

const DEFAULT_TARGET_URL =
	"https://github.com/vercel/examples/tree/main/apps/vibe-coding-platform";

export function VibeCodePlatformPage() {
	const { compile } = useSkills();
	const { isSignedIn, getToken } = useAuth();
	const [showAuthModal, setShowAuthModal] = useState(false);

	// Vercel deployment modal state
	const [isDeploying, setIsDeploying] = useState(false);
	const [deployedUrl, setDeployedUrl] = useState<string | null>(null);

	const handleSend = useCallback(
		async (prompt: string) => {
			const userToken = await getToken();
			if (!isSignedIn && !userToken) {
				setShowAuthModal(true);
				return false;
			}
			// Keep the EVE skill compile pipeline wired into chat sends.
			void compile(DEFAULT_TARGET_URL, prompt, true).catch(() => {
				// Skill compile is best-effort; chat streaming is independent.
			});
			return true;
		},
		[isSignedIn, getToken, compile],
	);

	const handleDeploy = async () => {
		setIsDeploying(true);
		await new Promise((r) => setTimeout(r, 2200));
		const randomHash = Math.random().toString(36).substring(2, 8);
		setDeployedUrl(`https://vibe-coding-app-${randomHash}.vercel.app`);
		setIsDeploying(false);
	};

	const headerActions = (
		<div className="flex items-center gap-2">
			{isSignedIn ? (
				<span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center gap-1">
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
			{deployedUrl ? (
				<a
					href={deployedUrl}
					target="_blank"
					rel="noreferrer"
					className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-slate-900 hover:bg-black text-white border border-slate-800 shadow-md flex items-center gap-1.5"
				>
					<Check className="h-3.5 w-3.5 text-emerald-400" />
					Deployed
				</a>
			) : (
				<Button
					onClick={handleDeploy}
					disabled={isDeploying}
					size="sm"
					className="text-xs font-bold gap-2 bg-slate-900 hover:bg-black text-white border border-slate-800 shadow-md transition-all rounded-lg cursor-pointer"
				>
					{isDeploying ? (
						<RefreshCw className="h-3.5 w-3.5 animate-spin" />
					) : (
						<VercelIcon className="h-3.5 w-3.5 fill-current" />
					)}
					{isDeploying ? "Deploying..." : "Deploy with Vercel"}
				</Button>
			)}
		</div>
	);

	return (
		<>
			<ChatProvider>
				<ErrorMonitor>
					<VibeApp onBeforeSend={handleSend} headerActions={headerActions} />
				</ErrorMonitor>
			</ChatProvider>
			<AuthPromptModal
				isOpen={showAuthModal}
				onClose={() => setShowAuthModal(false)}
				onAuthenticated={() => setShowAuthModal(false)}
			/>
		</>
	);
}
