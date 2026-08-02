import { createFileRoute } from "@tanstack/react-router";

import { Sandbox } from "@/server/vibe/local-sandbox";

export const Route = createFileRoute(
	"/api/vibe/sandboxes/$sandboxId/cmds/$cmdId/logs",
)({
	server: {
		handlers: {
			GET: async ({ params }) => {
				const { sandboxId, cmdId } = params;
				const encoder = new TextEncoder();
				const sandbox = Sandbox.get({ sandboxId });
				const command = sandbox.getCommand(cmdId);

				return new Response(
					new ReadableStream({
						async pull(controller) {
							for await (const logline of command.logs()) {
								controller.enqueue(
									encoder.encode(
										JSON.stringify({
											data: logline.data,
											stream: logline.stream,
											timestamp: Date.now(),
										}) + "\n",
									),
								);
							}
							controller.close();
						},
					}),
					{ headers: { "Content-Type": "application/x-ndjson" } },
				);
			},
		},
	},
});
