import { clerkMiddleware } from "@clerk/tanstack-react-start/server";
import { createMiddleware, createStart } from "@tanstack/react-start";

const hasClerkKeys = Boolean(
	process.env.CLERK_SECRET_KEY &&
	!process.env.CLERK_SECRET_KEY.includes("placeholder") &&
	process.env.VITE_CLERK_PUBLISHABLE_KEY &&
	!process.env.VITE_CLERK_PUBLISHABLE_KEY.includes("placeholder")
);

const safeClerkMiddleware = createMiddleware().server(async (opts) => {
	if (!hasClerkKeys) {
		return await opts.next({
			context: {
				auth: () => ({
					userId: null,
					sessionId: null,
					getToken: async () => null,
				}),
				clerkInitialState: {},
			},
		});
	}

	try {
		const baseClerk = clerkMiddleware();
		const result = await baseClerk.options.server(opts);
		if (result instanceof Response && result.status >= 300 && result.status < 400) {
			return await opts.next({
				context: {
					auth: () => ({
						userId: null,
						sessionId: null,
						getToken: async () => null,
					}),
					clerkInitialState: {},
				},
			});
		}
		return result;
	} catch (_err) {
		// Catch all redirects and errors from Clerk server middleware to prevent 307 redirect loops in iframe preview
		return await opts.next({
			context: {
				auth: () => ({
					userId: null,
					sessionId: null,
					getToken: async () => null,
				}),
				clerkInitialState: {},
			},
		});
	}
});

export const startInstance = createStart(() => ({
	requestMiddleware: [safeClerkMiddleware],
}));

export default startInstance;
