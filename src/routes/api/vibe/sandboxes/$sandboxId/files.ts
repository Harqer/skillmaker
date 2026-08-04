import { createFileRoute } from "@tanstack/react-router";
import z from "zod/v3";

import { Sandbox } from "@/server/vibe/local-sandbox";

const FileParamsSchema = z.object({
	sandboxId: z.string(),
	path: z.string(),
});

export const Route = createFileRoute("/api/vibe/sandboxes/$sandboxId/files")({
	server: {
		handlers: {
			GET: async ({ params, request }) => {
				const { sandboxId } = params;
				const url = new URL(request.url);
				const fileParams = FileParamsSchema.safeParse({
					path: url.searchParams.get("path"),
					sandboxId,
				});

				if (fileParams.success === false) {
					return new Response(
						JSON.stringify({
							error: "Invalid parameters. You must pass a `path` as query",
						}),
						{
							status: 400,
							headers: { "Content-Type": "application/json" },
						},
					);
				}

				const sandbox = Sandbox.get(fileParams.data);
				const stream = await sandbox.readFile(fileParams.data);
				if (!stream) {
					return new Response(
						JSON.stringify({ error: "File not found in the Sandbox" }),
						{
							status: 404,
							headers: { "Content-Type": "application/json" },
						},
					);
				}

				return new Response(
					new ReadableStream({
						async pull(controller) {
							for await (const chunk of stream) {
								controller.enqueue(chunk);
							}
							controller.close();
						},
					}),
				);
			},
		},
	},
});
