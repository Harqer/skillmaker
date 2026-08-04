import { tool, type UIMessageStreamWriter } from "ai";
import z from "zod/v3";

import type { ChatUIMessage } from "@/features/vibe/types";
import { Sandbox } from "../local-sandbox";
import { CREATE_SANDBOX_DESCRIPTION } from "./descriptions";
import { getRichError } from "./get-rich-error";

interface Params {
	writer: UIMessageStreamWriter<ChatUIMessage>;
}

export const createSandbox = ({ writer }: Params) =>
	tool({
		description: CREATE_SANDBOX_DESCRIPTION,
		inputSchema: z.object({
			timeout: z
				.number()
				.min(600000)
				.max(2700000)
				.optional()
				.describe(
					"Maximum time in milliseconds the sandbox will remain active before automatically shutting down. Minimum 600000ms (10 minutes), maximum 2700000ms (45 minutes). Defaults to 600000ms (10 minutes). The sandbox will terminate all running processes when this timeout is reached.",
				),
			ports: z
				.array(z.number())
				.max(2)
				.optional()
				.describe(
					"Array of network ports to expose. These ports allow web servers, APIs, or other services running inside the sandbox to be reached externally. Common ports include 3000 (Next.js), 8000 (Python servers), 5000 (Flask), etc.",
				),
		}),
		execute: async ({ timeout, ports }, { toolCallId }) => {
			writer.write({
				id: toolCallId,
				type: "data-create-sandbox",
				data: { status: "loading" },
			});

			try {
				const sandbox = await Sandbox.create({
					timeout: timeout ?? 600000,
					ports,
				});

				writer.write({
					id: toolCallId,
					type: "data-create-sandbox",
					data: { sandboxId: sandbox.sandboxId, status: "done" },
				});

				return (
					`Sandbox created with ID: ${sandbox.sandboxId}.` +
					`\nYou can now upload files, run commands, and access services on the exposed ports.`
				);
			} catch (error) {
				const richError = getRichError({
					action: "Creating Sandbox",
					error,
				});

				writer.write({
					id: toolCallId,
					type: "data-create-sandbox",
					data: {
						error: { message: richError.error.message },
						status: "error",
					},
				});

				console.log("Error creating Sandbox:", richError.error);
				return richError.message;
			}
		},
	});
