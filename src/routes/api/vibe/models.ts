import { createFileRoute } from "@tanstack/react-router";

import { MODEL_NAMES, SUPPORTED_MODELS } from "@/features/vibe/constants";

export const Route = createFileRoute("/api/vibe/models")({
	server: {
		handlers: {
			GET: async () => {
				return new Response(
					JSON.stringify({
						models: SUPPORTED_MODELS.map((id) => ({
							id,
							name: MODEL_NAMES[id] ?? id,
						})),
					}),
					{
						status: 200,
						headers: {
							"Content-Type": "application/json",
							"Cache-Control": "public, max-age=300",
						},
					},
				);
			},
		},
	},
});
