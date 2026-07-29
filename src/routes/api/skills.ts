import { createFileRoute } from "@tanstack/react-router";
import { createSkill, getSkills } from "@/server/skills";

export const Route = createFileRoute("/api/skills")({
	server: {
		handlers: {
			GET: async () => {
				try {
					const skillsList = await getSkills({ data: undefined });
					return new Response(JSON.stringify({ success: true, data: skillsList }), {
						status: 200,
						headers: {
							"Content-Type": "application/json",
						},
					});
				} catch (err: unknown) {
					const msg = err instanceof Error ? err.message : String(err);
					return new Response(JSON.stringify({ success: false, error: msg }), {
						status: 500,
						headers: {
							"Content-Type": "application/json",
						},
					});
				}
			},
			POST: async ({ request }) => {
				try {
					const body = await request.json();
					const result = await createSkill({ data: body });
					return new Response(JSON.stringify(result), {
						status: 200,
						headers: {
							"Content-Type": "application/json",
						},
					});
				} catch (err: unknown) {
					const msg = err instanceof Error ? err.message : String(err);
					return new Response(JSON.stringify({ success: false, error: msg }), {
						status: 400,
						headers: {
							"Content-Type": "application/json",
						},
					});
				}
			},
		},
	},
});
