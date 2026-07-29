import { createStart, createMiddleware } from '@tanstack/react-start'
import { clerkMiddleware } from '@clerk/tanstack-react-start/server'

const hasClerkKeys = Boolean(process.env.CLERK_SECRET_KEY)

const safeClerkMiddleware = createMiddleware().server(async (opts) => {
	if (!hasClerkKeys) {
		return await opts.next({
			context: {
				auth: () => ({ userId: null, sessionId: null, getToken: async () => null }),
				clerkInitialState: {},
			},
		})
	}

	try {
		const baseClerk = clerkMiddleware()
		return await baseClerk.options.server(opts)
	} catch (err) {
		if (err instanceof Response) {
			throw err
		}
		return await opts.next({
			context: {
				auth: () => ({ userId: null, sessionId: null, getToken: async () => null }),
				clerkInitialState: {},
			},
		})
	}
})

export const startInstance = createStart(() => ({
	requestMiddleware: [safeClerkMiddleware],
}))

export default startInstance



