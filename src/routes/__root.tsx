import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	createRootRoute,
	HeadContent,
	Link,
	Outlet,
	Scripts,
	useRouter,
} from "@tanstack/react-router";
import posthog from "posthog-js";
import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { syncClerkUser } from "@/server/skills";
import { ThemeProvider } from "@/components/layout/ThemeContext";
import {
	SafeClerkProvider,
	SignedIn,
	SignedOut,
	SignInButton,
	UserButton,
	useUser,
} from "@/components/auth/ClerkHelpers";
import { ClerkErrorBoundary } from "@/components/ErrorBoundary";
import { Sidebar } from "@/components/layout/Sidebar";
import { Button } from "@/components/ui/button";

// Safe memory storage fallback helper for sandboxed iframe environments
const memoryStorage = (() => {
	const data: Record<string, string> = {};
	return {
		getItem: (key: string) => (Object.hasOwn(data, key) ? data[key] : null),
		setItem: (key: string, value: string) => {
			data[key] = String(value);
		},
		removeItem: (key: string) => {
			delete data[key];
		},
		clear: () => {
			for (const k in data) delete data[k];
		},
	};
})();

export function safeLocalStorageGet(key: string): string | null {
	if (typeof window === "undefined") return null;
	try {
		return window.localStorage.getItem(key);
	} catch {
		return memoryStorage.getItem(key);
	}
}

export function safeLocalStorageSet(key: string, value: string): void {
	if (typeof window === "undefined") return;
	try {
		window.localStorage.setItem(key, value);
	} catch {
		memoryStorage.setItem(key, value);
	}
}

// Import your publishable key
const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || "";

if (typeof window !== "undefined" && import.meta.env.VITE_POSTHOG_KEY) {
	posthog.init(import.meta.env.VITE_POSTHOG_KEY, {
		api_host: import.meta.env.VITE_POSTHOG_HOST || "https://us.i.posthog.com",
		person_profiles: "identified_only",
	});
}

import appCss from "../styles.css?url";

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{
				charSet: "utf-8",
			},
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1",
			},
			{
				title: "Raven",
			},
		],
		links: [
			{
				rel: "preconnect",
				href: "https://fonts.googleapis.com",
			},
			{
				rel: "preconnect",
				href: "https://fonts.gstatic.com",
				crossOrigin: "anonymous",
			},
			{
				rel: "stylesheet",
				href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Merriweather:ital,wght@0,300;0,400;0,700;1,400&display=swap",
			},
			{
				rel: "stylesheet",
				href: appCss,
			},
		],
	}),
	component: RootComponent,
});

function RootComponent() {
	return (
		<RootDocument>
			<Outlet />
		</RootDocument>
	);
}

function RootDocument({ children }: { children: React.ReactNode }) {
	const router = useRouter();
	const queryClient = router.options.context?.queryClient || new QueryClient();

	return (
		<html lang="en">
			<head>
				<HeadContent />
				<script
					// biome-ignore lint/security/noDangerouslySetInnerHtml: Needed to inject storage shims and dark mode theme script before React hydration
					dangerouslySetInnerHTML={{
						__html: `
							(function() {
								function createMemoryStorage() {
									var store = {};
									return {
										getItem: function(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
										setItem: function(k, v) { store[k] = String(v); },
										removeItem: function(k) { delete store[k]; },
										clear: function() { store = {}; },
										key: function(i) { return Object.keys(store)[i] || null; },
										get length() { return Object.keys(store).length; }
									};
								}
								try {
									var test = window.localStorage;
									if (test) test.getItem("__test__");
								} catch (e) {
									try {
										Object.defineProperty(window, 'localStorage', {
											value: createMemoryStorage(),
											configurable: true,
											writable: true
										});
									} catch (err) {}
								}
								try {
									var test2 = window.sessionStorage;
									if (test2) test2.getItem("__test__");
								} catch (e) {
									try {
										Object.defineProperty(window, 'sessionStorage', {
											value: createMemoryStorage(),
											configurable: true,
											writable: true
										});
									} catch (err) {}
								}
								try {
									var savedTheme = window.localStorage.getItem("raven-theme");
									if (savedTheme === "dark") {
										document.documentElement.classList.add("dark");
									} else {
										document.documentElement.classList.remove("dark");
									}
								} catch (e) {}
							})();
						`,
					}}
				/>
			</head>
			<body>
				<QueryClientProvider client={queryClient}>
					<ClerkErrorBoundary>
						<ThemeProvider>
							<SafeClerkProvider
								publishableKey={PUBLISHABLE_KEY}
								afterSignOutUrl="/"
							>
								<ClerkUserSyncer />
								<div className="flex h-screen w-full bg-background font-sans antialiased text-foreground overflow-hidden">
									<Sidebar />
									<div className="flex flex-col flex-1 overflow-y-auto">
										<header className="p-8 pb-0">
											<div className="flex items-center justify-between">
												<Link to="/" className="flex items-center gap-3 group hover:opacity-90 transition-opacity cursor-pointer z-20">
													<img
														src="/peacock_logo.jpg"
														alt="Raven Peacock Logo"
														className="w-12 h-12 object-cover rounded-xl border border-border/60 shadow-sm group-hover:scale-105 transition-transform"
													/>
													<div className="flex flex-col">
														<span className="font-bold text-lg leading-tight tracking-tight text-foreground group-hover:text-primary transition-colors">
															Raven
														</span>
														<span className="text-xs italic text-muted-foreground font-serif">
															create your own expert agent
														</span>
													</div>
												</Link>
												<div
													className="flex items-center gap-4"
													suppressHydrationWarning
												>
													<SignedIn>
														<UserButton
															afterSignOutUrl="/"
															appearance={{
																elements: {
																	avatarBox:
																		"w-8 h-8 rounded-full border border-border",
																},
															}}
														/>
													</SignedIn>
													<SignedOut>
														<SignInButton mode="modal">
															<Button
																size="sm"
																className="text-xs font-semibold h-8 rounded-md bg-[#FF5F1F] hover:bg-[#E04F17] text-white border-none shadow-sm hover:shadow transition-all duration-200"
																suppressHydrationWarning
															>
																Sign In
															</Button>
														</SignInButton>
													</SignedOut>
												</div>
											</div>
										</header>
										<main className="flex-1">{children}</main>
									</div>
								</div>
							</SafeClerkProvider>
						</ThemeProvider>
					</ClerkErrorBoundary>
				</QueryClientProvider>
				<Scripts />
			</body>
		</html>
	);
}

function ClerkUserSyncer() {
	const { isLoaded, isSignedIn, user } = useUser();
	const syncFn = useServerFn(syncClerkUser);

	useEffect(() => {
		if (isLoaded && isSignedIn && user) {
			const email = user.emailAddresses[0]?.emailAddress;
			if (email) {
				syncFn({
					data: {
						email,
						firstName: user.firstName,
						lastName: user.lastName,
					},
				}).catch((err) => {
					console.error("Failed to sync Clerk user to Neon:", err);
				});
			}
		}
	}, [isLoaded, isSignedIn, user, syncFn]);

	return null;
}
