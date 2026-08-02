import { clerkMiddleware } from "@clerk/tanstack-react-start/server";
import { createMiddleware, createStart } from "@tanstack/react-start";

const safeClerkMiddleware = createMiddleware().server(async (opts) => {
	try {
		if (process.env.CLERK_SECRET_KEY) {
			const baseClerk = clerkMiddleware();
			return await baseClerk.options.server(opts);
		}
	} catch (_err) {
		// Clerk unavailable, fall through to mock
	}
	return await opts.next({
		context: {
			auth: () => ({
				userId: "user_mock",
				sessionId: null,
				getToken: async () => null,
			}),
			clerkInitialState: {},
		},
	});
});

export const startInstance = createStart(() => ({
	requestMiddleware: [safeClerkMiddleware],
}));

export default startInstance;
