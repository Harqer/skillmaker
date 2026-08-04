import { tool, type UIMessageStreamWriter } from "ai";
import z from "zod/v3";

import type { ChatUIMessage } from "@/features/vibe/types";
import { Sandbox } from "../local-sandbox";
import { GET_SANDBOX_URL_DESCRIPTION } from "./descriptions";

interface Params {
	writer: UIMessageStreamWriter<ChatUIMessage>;
}

export const getSandboxURL = ({ writer }: Params) =>
	tool({
		description: GET_SANDBOX_URL_DESCRIPTION,
		inputSchema: z.object({
			sandboxId: z
				.string()
				.describe(
					"The unique identifier of the sandbox (e.g., 'sbx_abc123xyz'). This ID is returned when creating a sandbox and is used to reference the specific sandbox instance.",
				),
			port: z
				.number()
				.describe(
					"The port number where a service is running inside the sandbox (e.g., 3000 for Next.js dev server, 8000 for Python apps, 5000 for Flask).",
				),
		}),
		execute: async ({ sandboxId, port }, { toolCallId }) => {
			writer.write({
				id: toolCallId,
				type: "data-get-sandbox-url",
				data: { status: "loading" },
			});

			const sandbox = Sandbox.get({ sandboxId });
			const url = sandbox.domain(port);

			writer.write({
				id: toolCallId,
				type: "data-get-sandbox-url",
				data: { url, status: "done" },
			});

			return { url };
		},
	});
