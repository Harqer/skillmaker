import {
	ClerkProvider,
	SignInButton as ClerkSignInButton,
	UserButton as ClerkUserButton,
	useAuth as useClerkAuth,
	useUser as useClerkUser,
} from "@clerk/tanstack-react-start";
import * as React from "react";
import { dark } from "@clerk/themes";
import { useTheme } from "../layout/ThemeContext";

// Detect if a valid Clerk Publishable Key is provided
const DEFAULT_PUBLISHABLE_KEY =
	(typeof process !== "undefined" && process.env?.VITE_CLERK_PUBLISHABLE_KEY) ||
	(typeof import.meta !== "undefined" && import.meta.env?.VITE_CLERK_PUBLISHABLE_KEY) ||
	"";

// Context to check if Clerk is initialized with a valid key
const ClerkActiveContext = React.createContext<boolean>(Boolean(DEFAULT_PUBLISHABLE_KEY));

class InnerClerkErrorBoundary extends React.Component<
	{ children: React.ReactNode; fallback: React.ReactNode },
	{ hasError: boolean }
> {
	constructor(props: { children: React.ReactNode; fallback: React.ReactNode }) {
		super(props);
		this.state = { hasError: false };
	}

	static getDerivedStateFromError() {
		return { hasError: true };
	}

	componentDidCatch(error: Error, info: React.ErrorInfo) {
		console.warn("ClerkProvider failed, falling back to Guest mode:", error, info);
	}

	render() {
		if (this.state.hasError) {
			return this.props.fallback;
		}
		return this.props.children;
	}
}

// Production-ready SafeClerkProvider
export function SafeClerkProvider({
	children,
	publishableKey,
	afterSignOutUrl,
}: {
	children: React.ReactNode;
	publishableKey: string;
	afterSignOutUrl?: string;
}) {
	const { isDark } = useTheme();
	const activeKey = publishableKey || DEFAULT_PUBLISHABLE_KEY;
	const [isMounted, setIsMounted] = React.useState(false);
	const [isIframe, setIsIframe] = React.useState(false);

	React.useEffect(() => {
		setIsMounted(true);
		if (typeof window !== "undefined") {
			try {
				if (window.self !== window.top) {
					setIsIframe(true);
				}
			} catch {
				setIsIframe(true);
			}
		}
	}, []);

	const fallbackUI = (
		<ClerkActiveContext.Provider value={false}>
			{children}
		</ClerkActiveContext.Provider>
	);

	// On SSR and initial client hydration pass, or if key is missing or inside iframe,
	// render the fallback UI to ensure 100% hydration matching.
	if (!activeKey || !isMounted || isIframe) {
		return fallbackUI;
	}

	return (
		<InnerClerkErrorBoundary fallback={fallbackUI}>
			<ClerkActiveContext.Provider value={true}>
				<ClerkProvider
					publishableKey={activeKey}
					afterSignOutUrl={afterSignOutUrl}
					appearance={{
						baseTheme: isDark ? dark : undefined,
					}}
				>
					{children}
				</ClerkProvider>
			</ClerkActiveContext.Provider>
		</InnerClerkErrorBoundary>
	);
}

export function useAuth() {
	const isClerkActive = React.useContext(ClerkActiveContext);

	if (!isClerkActive) {
		return {
			isLoaded: true,
			isSignedIn: false,
			userId: null,
			sessionId: null,
			getToken: async () => null,
			signOut: async () => {},
		};
	}

	// biome-ignore lint/correctness/useHookAtTopLevel: Static publishable key context flag makes hook execution order 100% stable
	return useClerkAuth();
}

export function useUser() {
	const isClerkActive = React.useContext(ClerkActiveContext);

	if (!isClerkActive) {
		return {
			isLoaded: true,
			isSignedIn: false,
			user: null,
		};
	}

	// biome-ignore lint/correctness/useHookAtTopLevel: Static publishable key context flag makes hook execution order 100% stable
	return useClerkUser();
}

// Export clean, direct production-ready authentication wrapper components
export function SignedIn({ children }: { children: React.ReactNode }) {
	const { isSignedIn, isLoaded } = useAuth();
	if (!isLoaded || !isSignedIn) {
		return null;
	}
	return <>{children}</>;
}

export function SignedOut({ children }: { children: React.ReactNode }) {
	const { isSignedIn, isLoaded } = useAuth();
	if (!isLoaded || isSignedIn) {
		return null;
	}
	return <>{children}</>;
}

// Export clean, direct production-ready buttons
// biome-ignore lint/suspicious/noExplicitAny: Generic prop wrapper
export function SignInButton(props: any) {
	const isClerkActive = React.useContext(ClerkActiveContext);

	if (!isClerkActive) {
		// In iframe preview / guest mode, open app in new tab if user clicks Sign In
		const handleClick = () => {
			if (typeof window !== "undefined") {
				window.open(window.location.href, "_blank");
			}
		};

		if (props.children) {
			try {
				return React.cloneElement(React.Children.only(props.children), {
					onClick: handleClick,
				});
			} catch {
				// Fallback if not a single element
			}
		}

		return (
			<button
				type="button"
				onClick={handleClick}
				className="px-4 py-2 text-sm font-semibold rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground transition-colors inline-flex items-center gap-2"
			>
				Sign In (New Tab)
			</button>
		);
	}
	return <ClerkSignInButton {...props} />;
}

// biome-ignore lint/suspicious/noExplicitAny: Generic prop wrapper
export function UserButton(props: any) {
	const isClerkActive = React.useContext(ClerkActiveContext);
	if (!isClerkActive) {
		return (
			<div className="w-6 h-6 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-[10px] font-bold text-primary">
				G
			</div>
		);
	}
	return <ClerkUserButton {...props} />;
}

