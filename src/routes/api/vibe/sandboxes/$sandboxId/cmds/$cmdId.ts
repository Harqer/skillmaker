import { createFileRoute } from "@tanstack/react-router";

import { Sandbox } from "@/server/vibe/local-sandbox";

export const Route = createFileRoute("/api/vibe/sandboxes/$sandboxId/cmds/$cmdId")({
	server: {
		handlers: {
			GET: async ({ params }) => {
				const { sandboxId, cmdId } = params;
				const sandbox = Sandbox.get({ sandboxId });
				const command = sandbox.getCommand(cmdId);

				/**
				 * The wait can get to fail when the Sandbox is stopped but the command
				 * was still running. In such case we return empty for finish data.
				 */
				const done = await command.wait().catch(() => null);
				return new Response(
					JSON.stringify({
						sandboxId: sandbox.sandboxId,
						cmdId: command.cmdId,
						startedAt: command.startedAt,
						exitCode: done?.exitCode,
					}),
					{
						status: 200,
						headers: { "Content-Type": "application/json" },
					},
				);
			},
		},
	},
});
