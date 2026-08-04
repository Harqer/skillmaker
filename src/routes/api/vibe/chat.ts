import { createFileRoute } from "@tanstack/react-router";
import {
	convertToModelMessages,
	createUIMessageStream,
	createUIMessageStreamResponse,
	stepCountIs,
	streamText,
} from "ai";

import { DEFAULT_MODEL, MODEL_NAMES, SUPPORTED_MODELS } from "@/features/vibe/constants";
import type { ChatUIMessage } from "@/features/vibe/types";
import { getModelOptions } from "@/server/vibe/gateway";
import { vibePrompt } from "@/server/vibe/prompt";
import { tools } from "@/server/vibe/tools";

interface BodyData {
	messages: ChatUIMessage[];
	modelId?: string;
	reasoningEffort?: "low" | "medium";
}

export const Route = createFileRoute("/api/vibe/chat")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const { messages, modelId = DEFAULT_MODEL, reasoningEffort } =
					(await request.json()) as BodyData;

				if (!SUPPORTED_MODELS.includes(modelId)) {
					return new Response(
						JSON.stringify({ error: `Model ${modelId} not found.` }),
						{ status: 400, headers: { "Content-Type": "application/json" } },
					);
				}

				return createUIMessageStreamResponse({
					stream: createUIMessageStream({
						originalMessages: messages,
						execute: async ({ writer }) => {
							const result = streamText({
								...getModelOptions(modelId, { reasoningEffort }),
								system: vibePrompt,
								messages: await convertToModelMessages(
									messages.map((message) => {
										message.parts = message.parts.map((part) => {
											if (part.type === "data-report-errors") {
												return {
													type: "text",
													text:
														`There are errors in the generated code. This is the summary of the errors we have:\n` +
														`\`\`\`${part.data.summary}\`\`\`\n` +
														(part.data.paths?.length
															? `The following files may contain errors:\n` +
																`\`\`\`${part.data.paths?.join("\n")}\`\`\`\n`
															: "") +
														`Fix the errors reported.`,
												};
											}
											return part;
										});
										return message;
									}),
								),
								stopWhen: stepCountIs(20),
								tools: tools({ modelId, writer }),
								onError: (error) => {
									console.error("Error communicating with AI");
									console.error(JSON.stringify(error, null, 2));
								},
							});
							result.consumeStream();
							writer.merge(
								result.toUIMessageStream({
									sendReasoning: true,
									sendStart: false,
									messageMetadata: () => ({
										model: MODEL_NAMES[modelId] ?? modelId,
									}),
								}),
							);
						},
					}),
				});
			},
		},
	},
});
