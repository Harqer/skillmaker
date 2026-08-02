import {
	ClerkProvider,
	SignInButton as ClerkSignInButton,
	UserButton as ClerkUserButton,
	useAuth as useClerkAuth,
	useUser as useClerkUser,
} from "@clerk/tanstack-react-start";
import { dark } from "@clerk/themes";
import * as React from "react";
import { useTheme } from "../layout/ThemeContext";

// Detect if a valid Clerk Publishable Key is provided
const getRawPublishableKey = (): string => {
	const key =
		(typeof process !== "undefined" && process.env?.VITE_CLERK_PUBLISHABLE_KEY) ||
		(typeof import.meta !== "undefined" &&
			import.meta.env?.VITE_CLERK_PUBLISHABLE_KEY) ||
		"";
	if (
		!key ||
		key.includes("placeholder") ||
		key.includes("your_key") ||
		!key.startsWith("pk_")
	) {
		return "";
	}
	return key;
};

const DEFAULT_PUBLISHABLE_KEY = getRawPublishableKey();

// Context to check if Clerk is initialized with a valid key
const ClerkActiveContext = React.createContext<boolean>(false);

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
		console.warn(
			"ClerkProvider failed, falling back to Guest mode:",
			error,
			info,
		);
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
	const rawKey = publishableKey || DEFAULT_PUBLISHABLE_KEY;
	const isValidKey =
		Boolean(rawKey) &&
		rawKey.startsWith("pk_") &&
		!rawKey.includes("placeholder") &&
		!rawKey.includes("your_key");
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

	// On SSR and initial client hydration pass, or if key is missing/invalid,
	// render the fallback UI to ensure 100% hydration matching.
	if (!isValidKey || !isMounted) {
		return fallbackUI;
	}

	return (
		<InnerClerkErrorBoundary fallback={fallbackUI}>
			<ClerkProvider
				publishableKey={rawKey}
				afterSignOutUrl={afterSignOutUrl}
				appearance={{
					baseTheme: isDark ? dark : undefined,
				}}
			>
				<ClerkActiveContext.Provider value={true}>
					{children}
				</ClerkActiveContext.Provider>
			</ClerkProvider>
		</InnerClerkErrorBoundary>
	);
}

export function useAuth() {
	const isClerkActive = React.useContext(ClerkActiveContext);

	if (!isClerkActive) {
		const storedToken = typeof window !== "undefined" ? localStorage.getItem("fastapi_auth_token") : null;
		return {
			isLoaded: true,
			isSignedIn: Boolean(storedToken),
			userId: storedToken ? "jwt_user" : null,
			sessionId: storedToken ? "jwt_session" : null,
			getToken: async () => storedToken || null,
			signOut: async () => {
				if (typeof window !== "undefined") {
					localStorage.removeItem("fastapi_auth_token");
				}
			},
		};
	}

	try {
		// biome-ignore lint/correctness/useHookAtTopLevel: Static publishable key context flag makes hook execution order 100% stable
		const clerkAuth = useClerkAuth();
		const storedToken = typeof window !== "undefined" ? localStorage.getItem("fastapi_auth_token") : null;

		return {
			...clerkAuth,
			isSignedIn: clerkAuth.isSignedIn || Boolean(storedToken),
			getToken: async (options?: unknown) => {
				try {
					const token = await clerkAuth.getToken(options);
					if (token) return token;
				} catch (_e) {}
				return storedToken || null;
			},
		};
	} catch (e) {
		console.warn("useAuth caught Clerk context error, falling back to stored token or guest mode:", e);
		const storedToken = typeof window !== "undefined" ? localStorage.getItem("fastapi_auth_token") : null;
		return {
			isLoaded: true,
			isSignedIn: Boolean(storedToken),
			userId: storedToken ? "jwt_user" : null,
			sessionId: storedToken ? "jwt_session" : null,
			getToken: async () => storedToken || null,
			signOut: async () => {
				if (typeof window !== "undefined") {
					localStorage.removeItem("fastapi_auth_token");
				}
			},
		};
	}
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

	try {
		// biome-ignore lint/correctness/useHookAtTopLevel: Static publishable key context flag makes hook execution order 100% stable
		return useClerkUser();
	} catch (e) {
		console.warn("useUser caught Clerk context error, falling back to guest mode:", e);
		return {
			isLoaded: true,
			isSignedIn: false,
			user: null,
		};
	}
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
		// In preview / guest mode, sign-in is disabled safely without popups
		const handleClick = (e?: React.MouseEvent) => {
			e?.preventDefault();
			e?.stopPropagation();
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
				className="px-4 py-2 text-sm font-semibold rounded-lg bg-primary/20 text-primary transition-colors inline-flex items-center gap-2 cursor-default"
			>
				Guest Mode
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
