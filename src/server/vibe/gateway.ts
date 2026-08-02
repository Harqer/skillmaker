import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import {
	createOpenAI,
	type OpenAIResponsesProviderOptions,
} from "@ai-sdk/openai";
import type { JSONValue, LanguageModel } from "ai";

import { Models } from "@/features/vibe/constants";

export interface ModelOptions {
	model: LanguageModel;
	providerOptions?: Record<string, Record<string, JSONValue>>;
	headers?: Record<string, string>;
}

function env(name: string): string | undefined {
	return process.env[name] || undefined;
}

export function getModelOptions(
	modelId: string,
	options?: { reasoningEffort?: "low" | "medium" | "high" },
): ModelOptions {
	if (modelId === Models.OpenAIGPT53Codex) {
		return {
			model: createOpenAI({ apiKey: env("OPENAI_API_KEY") })("gpt-5.3-codex"),
			providerOptions: {
				openai: {
					include: ["reasoning.encrypted_content"],
					reasoningEffort: options?.reasoningEffort ?? "low",
					reasoningSummary: "auto",
					serviceTier: "priority",
				} satisfies OpenAIResponsesProviderOptions,
			},
		};
	}

	if (
		modelId === Models.AnthropicClaudeSonnet46 ||
		modelId === Models.AnthropicClaudeOpus46
	) {
		return {
			model:
				modelId === Models.AnthropicClaudeOpus46
					? anthropic("claude-opus-4-6")
					: anthropic("claude-sonnet-4-6"),
			headers: { "anthropic-beta": "fine-grained-tool-streaming-2025-05-14" },
			providerOptions: {
				anthropic: {
					cacheControl: { type: "ephemeral" },
				},
			},
		};
	}

	if (modelId === Models.XaiGrok41Reasoning) {
		return {
			model: createOpenAI({
				apiKey: env("XAI_API_KEY"),
				baseURL: "https://api.x.ai/v1",
			})("grok-4.1-fast-reasoning"),
		};
	}

	return {
		model: google("gemini-2.5-flash"),
	};
}
