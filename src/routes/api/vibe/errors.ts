import { createFileRoute } from "@tanstack/react-router";
import { generateText, Output } from "ai";

import { linesSchema, resultSchema } from "@/components/vibe/error-monitor/schemas";
import { Models } from "@/features/vibe/constants";
import { getModelOptions } from "@/server/vibe/gateway";
import { errorsPrompt } from "@/server/vibe/prompt";

export const Route = createFileRoute("/api/vibe/errors")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const body = await request.json();
				const parsedBody = linesSchema.safeParse(body);
				if (!parsedBody.success) {
					return new Response(JSON.stringify({ error: `Invalid request` }), {
						status: 400,
						headers: { "Content-Type": "application/json" },
					});
				}

				const result = await generateText({
					...getModelOptions(Models.OpenAIGPT53Codex, {
						reasoningEffort: "low",
					}),
					system: errorsPrompt,
					messages: [
						{ role: "user", content: JSON.stringify(parsedBody.data) },
					],
					output: Output.object({ schema: resultSchema }),
				});

				return new Response(JSON.stringify(result.output), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				});
			},
		},
	},
});
