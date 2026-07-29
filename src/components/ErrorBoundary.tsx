import * as React from "react";

interface Props {
	children: React.ReactNode;
}

interface State {
	hasError: boolean;
	error: Error | null;
}

export class ClerkErrorBoundary extends React.Component<Props, State> {
	constructor(props: Props) {
		super(props);
		this.state = { hasError: false, error: null };
	}

	componentDidMount() {
		if (typeof window !== "undefined") {
			window.addEventListener("error", this.handleGlobalError);
			window.addEventListener(
				"unhandledrejection",
				this.handlePromiseRejection,
			);
		}
	}

	componentWillUnmount() {
		if (typeof window !== "undefined") {
			window.removeEventListener("error", this.handleGlobalError);
			window.removeEventListener(
				"unhandledrejection",
				this.handlePromiseRejection,
			);
		}
	}

	handleGlobalError = (event: ErrorEvent) => {
		const message = event.message || "";
		const filename = event.filename || "";
		const errorStack = event.error?.stack || "";
		const errorString = String(event.error || "");

		const isClerkOrIframeIssue =
			message.toLowerCase().includes("clerk") ||
			filename.toLowerCase().includes("clerk") ||
			filename.toLowerCase().includes("clerk.accounts.dev") ||
			errorStack.toLowerCase().includes("clerk") ||
			errorStack.toLowerCase().includes("clerk.accounts.dev") ||
			errorString.toLowerCase().includes("clerk") ||
			message.toLowerCase().includes("script error") ||
			message.toLowerCase().includes("security") ||
			message.toLowerCase().includes("storage") ||
			message.toLowerCase().includes("cookie") ||
			filename === "";

		if (isClerkOrIframeIssue) {
			console.warn(
				"ClerkErrorBoundary caught global Clerk/iframe error, handled gracefully:",
				event,
			);
			try {
				event.preventDefault();
			} catch {
				// Ignore silent prevention failures
			}
			// Do not set hasError: true for global async Clerk script/cookie errors.
			// Our safe ClerkHelpers hooks will fall back to Guest Mode gracefully.
		}
	};

	handlePromiseRejection = (event: PromiseRejectionEvent) => {
		const reason = event.reason;
		const message = reason?.message || "";
		const errorStack = reason?.stack || "";

		const isClerkOrIframeIssue =
			message.toLowerCase().includes("clerk") ||
			errorStack.toLowerCase().includes("clerk") ||
			String(reason).toLowerCase().includes("clerk") ||
			message.toLowerCase().includes("security") ||
			message.toLowerCase().includes("storage") ||
			message.toLowerCase().includes("cookie") ||
			String(reason).toLowerCase().includes("script error");

		if (isClerkOrIframeIssue) {
			console.warn(
				"ClerkErrorBoundary caught global Clerk/iframe promise rejection, handled gracefully:",
				event,
			);
			try {
				event.preventDefault();
			} catch {
				// Ignore silent prevention failures
			}
			// Do not set hasError: true for global async Clerk script/cookie errors.
			// Our safe ClerkHelpers hooks will fall back to Guest Mode gracefully.
		}
	};

	static getDerivedStateFromError(error: Error): State {
		return { hasError: true, error };
	}

	componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
		console.error("ClerkErrorBoundary caught an error:", error, errorInfo);
	}

	render() {
		if (this.state.hasError) {
			console.warn(
				"ClerkErrorBoundary caught runtime error, rendering app in fallback guest mode:",
				this.state.error,
			);
			return (
				<div className="w-full h-full flex flex-col items-center justify-center p-6 text-center">
					<p className="text-sm text-muted-foreground mb-4">
						A temporary rendering issue occurred. Reloading mode...
					</p>
					<button
						type="button"
						onClick={() => this.setState({ hasError: false, error: null })}
						className="px-4 py-2 text-xs font-semibold rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
					>
						Reset Application
					</button>
				</div>
			);
		}

		return this.props.children;
	}
}
