import { createFileRoute } from "@tanstack/react-router";

import { Sandbox } from "@/server/vibe/local-sandbox";

export const Route = createFileRoute("/api/vibe/sandboxes/$sandboxId")({
	server: {
		handlers: {
			GET: async ({ params }) => {
				const { sandboxId } = params;
				try {
					const sandbox = Sandbox.get({ sandboxId });
					return new Response(
						JSON.stringify({ status: sandbox.stopped ? "stopped" : "running" }),
						{
							status: 200,
							headers: { "Content-Type": "application/json" },
						},
					);
				} catch (error) {
					if (error instanceof Error && error.message.includes("Sandbox not found")) {
						return new Response(JSON.stringify({ status: "stopped" }), {
							status: 200,
							headers: { "Content-Type": "application/json" },
						});
					}
					throw error;
				}
			},
		},
	},
});
