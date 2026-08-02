import { ShieldAlert, Key, LogIn, CheckCircle2, Lock } from "lucide-react";
import { useState } from "react";
import { SignInButton, useAuth } from "./ClerkHelpers";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

interface AuthPromptModalProps {
	isOpen: boolean;
	onClose: () => void;
	title?: string;
	description?: string;
	onAuthenticated?: () => void;
}

export function AuthPromptModal({
	isOpen,
	onClose,
	title = "Authentication Required",
	description = "The backend service requires a valid JWT authentication token to run sandbox builds, clone GitHub repositories, and synthesize source code.",
	onAuthenticated,
}: AuthPromptModalProps) {
	const { isSignedIn } = useAuth();
	const [customToken, setCustomToken] = useState("");
	const [tokenSaved, setTokenSaved] = useState(false);
	const [showManualInput, setShowManualInput] = useState(false);

	if (!isOpen) return null;

	const handleSaveToken = () => {
		if (!customToken.trim()) return;
		const cleanToken = customToken.trim();
		try {
			localStorage.setItem("fastapi_auth_token", cleanToken);
			setTokenSaved(true);
			setTimeout(() => {
				setTokenSaved(false);
				onAuthenticated?.();
				onClose();
			}, 1000);
		} catch (e) {
			console.error("Failed to save auth token to localStorage:", e);
		}
	};

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
			<div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-6 text-slate-100">
				{/* Header */}
				<div className="flex items-start gap-4">
					<div className="p-3 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20 shrink-0">
						<ShieldAlert className="w-6 h-6" />
					</div>
					<div className="space-y-1">
						<h3 className="text-lg font-bold text-white flex items-center gap-2">
							{title}
						</h3>
						<p className="text-xs text-slate-400 leading-relaxed">
							{description}
						</p>
					</div>
				</div>

				{/* Warning Alert Box */}
				<div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 text-xs text-slate-300 space-y-1 font-mono">
					<div className="flex items-center gap-2 text-amber-400 font-semibold">
						<Lock className="w-3.5 h-3.5" /> 401 Unauthorized Prevention
					</div>
					<p className="text-[11px] text-slate-400">
						Unauthenticated requests fall back to text synthesis without repository source code access. Sign in to obtain a valid bearer token.
					</p>
				</div>

				{/* Primary Sign In Button */}
				<div className="space-y-3">
					{!isSignedIn ? (
						<SignInButton mode="modal">
							<Button className="w-full h-11 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-sm rounded-xl transition shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2">
								<LogIn className="w-4 h-4" /> Sign In / Sign Up to Authenticate
							</Button>
						</SignInButton>
					) : (
						<div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-2 text-xs text-emerald-400">
							<CheckCircle2 className="w-4 h-4 shrink-0" />
							<span>You are signed in! Your session token is attached to backend requests.</span>
						</div>
					)}

					{/* Toggle Manual JWT Input */}
					<div className="pt-2 border-t border-slate-800">
						<button
							type="button"
							onClick={() => setShowManualInput(!showManualInput)}
							className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1.5 transition"
						>
							<Key className="w-3.5 h-3.5" />
							{showManualInput
								? "Hide manual JWT token entry"
								: "Or paste custom JWT / FASTAPI_AUTH_TOKEN..."}
						</button>

						{showManualInput && (
							<div className="mt-3 space-y-3 animate-in slide-in-from-top-2 duration-150">
								<div className="space-y-1.5">
									<Label htmlFor="jwt-token-input" className="text-xs text-slate-300 font-mono">
										JWT Bearer Token
									</Label>
									<Input
										id="jwt-token-input"
										type="password"
										placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6..."
										value={customToken}
										onChange={(e) => setCustomToken(e.target.value)}
										className="bg-slate-950 border-slate-800 text-xs text-slate-100 font-mono focus:border-amber-500"
									/>
								</div>

								<Button
									onClick={handleSaveToken}
									disabled={!customToken.trim() || tokenSaved}
									className="w-full h-9 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-lg"
								>
									{tokenSaved ? (
										<span className="flex items-center gap-1.5 text-emerald-400">
											<CheckCircle2 className="w-3.5 h-3.5" /> Token Saved
										</span>
									) : (
										"Save Token & Authenticate"
									)}
								</Button>
							</div>
						)}
					</div>
				</div>

				{/* Footer buttons */}
				<div className="flex justify-end pt-2 border-t border-slate-800">
					<Button
						variant="ghost"
						onClick={onClose}
						className="text-xs text-slate-400 hover:text-white"
					>
						Close
					</Button>
				</div>
			</div>
		</div>
	);
}
