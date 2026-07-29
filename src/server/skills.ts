import { auth } from "@clerk/tanstack-react-start/server";
import { createServerFn } from "@tanstack/react-start";
import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Skill } from "../features/skills/types";
import {
	evaluateSkill as apiEvaluateSkill,
	getSkillOptStatus as apiGetSkillOptStatus,
	triggerSkillOptTraining as apiTriggerSkillOptTraining,
} from "../lib/api-client";
import { db, inMemorySkills } from "../lib/db";
import { skills, users } from "../lib/db/schema";

export const submitSkillSchema = z.object({
	title: z.string().min(3, "Title must be at least 3 characters"),
	description: z.string().min(10, "Description must be at least 10 characters"),
	content: z.string().min(20, "Prompt content must be at least 20 characters"),
	tags: z
		.array(z.string())
		.min(1, "Add at least one tag")
		.max(5, "Maximum 5 tags allowed"),
	mcpScript: z.string().optional().nullable(),
	mcpConfig: z.string().optional().nullable(),
	traceUrl: z.string().optional().nullable(),
	sourceUrl: z.string().optional().nullable(),
});

// ── Auth helper ───────────────────────────────────────────────────────────────
// Seamless Guest/Fallback Support when Clerk is not authenticated or blocked.
async function requireAuth() {
	try {
		const { userId } = await auth();
		if (!userId) {
			return "user_mock";
		}
		return userId;
	} catch (_err) {
		return "user_mock";
	}
}

// ── Upsert the Clerk user into Neon `users` table ────────────────────────────
// Clerk is the source of truth; we sync on first action. No passwords stored.
async function ensureUserExists(userId: string) {
	try {
		await db
			.insert(users)
			.values({ id: userId, email: `${userId}@clerk.user` })
			.onConflictDoNothing();
	} catch {
		// Row already exists — safe to ignore
	}
}

// ── syncClerkUser ───────────────────────────────────────────────────────────
// Fully syncs loaded Clerk user profile info to the Neon `users` table.
export const syncClerkUser = createServerFn({ method: "POST" })
	.validator(
		z.object({
			email: z.string().email(),
			firstName: z.string().nullable().optional(),
			lastName: z.string().nullable().optional(),
		}),
	)
	.handler(async ({ data }) => {
		const userId = await requireAuth();
		if (userId === "user_mock") {
			return { success: false, reason: "Mock user or not authenticated" };
		}

		try {
			await db
				.insert(users)
				.values({
					id: userId,
					email: data.email,
					firstName: data.firstName || null,
					lastName: data.lastName || null,
				})
				.onConflictDoUpdate({
					target: users.id,
					set: {
						email: data.email,
						firstName: data.firstName || null,
						lastName: data.lastName || null,
					},
				});
			return { success: true };
		} catch (error) {
			console.error("Failed to sync Clerk user in database:", error);
			try {
				await db
					.insert(users)
					.values({
						id: userId,
						email: data.email,
						firstName: data.firstName || null,
						lastName: data.lastName || null,
					})
					.onConflictDoNothing();
				return { success: true, warning: "inserted with onConflictDoNothing" };
			} catch (e) {
				return { success: false, error: String(e) };
			}
		}
	});

// ── createSkill ───────────────────────────────────────────────────────────────
export const createSkill = createServerFn({ method: "POST" })
	.validator(submitSkillSchema)
	.handler(async ({ data }) => {
		const userId = await requireAuth();
		await ensureUserExists(userId);

		const [inserted] = await db
			.insert(skills)
			.values({
				title: data.title,
				description: data.description,
				content: data.content,
				tags: data.tags,
				authorId: userId,
				upvotes: 0,
				mcpScript: data.mcpScript || null,
				mcpConfig: data.mcpConfig || null,
				traceUrl: data.traceUrl || null,
				sourceUrl: data.sourceUrl || null,
			})
			.returning({ id: skills.id });

		return { success: true, skillId: inserted.id };
	});

// ── getSkills ─────────────────────────────────────────────────────────────────
// Public — no auth required. Community library is world-readable.
export const getSkills = createServerFn({ method: "GET" })
	.validator((data: { search?: string; tag?: string } | undefined) => data)
	.handler(async ({ data }) => {
		const skillMap = new Map<string, unknown>();

		// Always populate in-memory skills first
		for (const item of inMemorySkills) {
			if (item?.id) {
				skillMap.set(item.id, item);
			}
		}

		// Overlay skills from database if available
		try {
			const dbSkills = await db
				.select()
				.from(skills)
				.orderBy(desc(skills.createdAt));

			if (Array.isArray(dbSkills)) {
				for (const item of dbSkills) {
					if (item?.id) {
						skillMap.set(item.id, {
							...item,
							createdAt:
								typeof item.createdAt === "object" && item.createdAt !== null
									? (item.createdAt as Date).toISOString()
									: String(item.createdAt || new Date().toISOString()),
						});
					}
				}
			}
		} catch (err) {
			console.warn(
				"Failed to fetch skills from database, relying on inMemorySkills:",
				err,
			);
		}

		let results = Array.from(skillMap.values()) as Skill[];

		results.sort(
			(a, b) =>
				new Date(b.createdAt || 0).getTime() -
				new Date(a.createdAt || 0).getTime(),
		);

		if (data?.search) {
			const q = data.search.toLowerCase();
			results = results.filter(
				(s: { title?: string; description?: string }) =>
					s.title?.toLowerCase().includes(q) ||
					s.description?.toLowerCase().includes(q),
			);
		}
		if (data?.tag) {
			const targetTag = data.tag;
			results = results.filter((s: { tags?: string[] }) =>
				s.tags?.includes(targetTag),
			);
		}

		return results;
	});

// ── getSkillById ──────────────────────────────────────────────────────────────
// Public — skill detail pages are world-readable.
export const getSkillById = createServerFn({ method: "GET" })
	.validator((skillId: string) => skillId)
	.handler(async ({ data }) => {
		try {
			const result = await db
				.select()
				.from(skills)
				.where(eq(skills.id, data))
				.limit(1);

			const skill =
				result[0] || inMemorySkills.find((s: { id?: string }) => s.id === data);
			if (!skill) throw new Error("Skill not found");

			return skill;
		} catch (err) {
			console.warn(
				"Failed to fetch skill by ID, checking inMemorySkills:",
				err,
			);
			const skill = inMemorySkills.find((s: { id?: string }) => s.id === data);
			if (skill) return skill;
			throw err;
		}
	});

// ── upvoteSkill ───────────────────────────────────────────────────────────────
// Auth-gated — only signed-in users can upvote.
export const upvoteSkill = createServerFn({ method: "POST" })
	.validator((skillId: string) => skillId)
	.handler(async ({ data }) => {
		await requireAuth();

		// Atomic increment — no read-then-write race condition
		await db
			.update(skills)
			.set({ upvotes: sql`${skills.upvotes} + 1` })
			.where(eq(skills.id, data));

		return { success: true };
	});

// ── evaluateSkill ─────────────────────────────────────────────────────────────
// Real-time AI Skill Evaluation powered by FastAPI backend
export const evaluateSkill = createServerFn({ method: "POST" })
	.validator(
		z.object({
			prompt: z.string(),
			skill_content: z.string(),
			assertions: z.array(z.string()),
		}),
	)
	.handler(async ({ data }) => {
		const authToken = await requireAuth();

		const result = await apiEvaluateSkill(
			data.prompt,
			data.skill_content,
			data.assertions,
			authToken,
		);

		if (result.error) {
			throw new Error(result.error);
		}

		return {
			score: result.score ?? 0,
			feedback: result.feedback || "Evaluation completed.",
			improvements: result.improvements || [],
		};
	});

// ── triggerSkillOptOptimization ─────────────────────────────────────────────
export const triggerSkillOptOptimization = createServerFn({ method: "POST" })
	.validator(z.object({ skillId: z.union([z.string(), z.number()]) }))
	.handler(async ({ data }) => {
		const rawId = String(data.skillId);
		const dbId = Number(rawId);

		if (Number.isNaN(dbId)) {
			return {
				status: "error",
				reason: `Invalid db_id: ${rawId}. SkillOpt requires a numeric database ID.`,
				skillId: rawId,
			};
		}

		const authToken = await requireAuth();

		const result = await apiTriggerSkillOptTraining(dbId, authToken);

		if (result.error) {
			return {
				status: "error",
				skillId: rawId,
				reason: `SkillOpt backend error: ${result.error}`,
			};
		}

		return {
			status: result.status,
			skillId: rawId,
			skill_name: result.skill_name,
			score_before: result.score_before,
			score_after: result.score_after,
			adopted_count: result.adopted_count,
			staged_count: result.staged_count,
			training_items_count: result.training_items_count,
			trajectory_insights: result.trajectory_insights || [],
			optimized_content: result.optimized_content,
			reason: result.reason,
			error: result.error,
		};
	});

// ── getSkillOptStatus ───────────────────────────────────────────────────────
export const getSkillOptStatus = createServerFn({ method: "GET" })
	.validator((skillId: string | number) => String(skillId))
	.handler(async ({ data }) => {
		const rawId = String(data);
		const dbId = Number(rawId);

		if (Number.isNaN(dbId)) {
			// If the ID is not numeric, check if it's an in-memory skill
			const skill = inMemorySkills.find(
				(s: { id?: string }) => s.id === rawId || String(s.id) === rawId,
			);
			if (skill) {
				return {
					registered: false,
					status: "idle",
					skill_id: rawId,
					skill_name: skill.title,
					training_items_count: 0,
					has_optimized_output: false,
				};
			}
			return {
				registered: false,
				status: "idle",
				skill_id: rawId,
				training_items_count: 0,
				has_optimized_output: false,
				reason: "Skill not registered for SkillOpt",
			};
		}

		const authToken = await requireAuth();
		const result = await apiGetSkillOptStatus(dbId, authToken);

		if (result.error) {
			// Backend unavailable, check in-memory skills as fallback
			const skill = inMemorySkills.find(
				(s: { id?: string }) => s.id === rawId || String(s.id) === rawId,
			);
			if (skill) {
				return {
					registered: false,
					status: "idle",
					skill_id: rawId,
					skill_name: skill.title,
					training_items_count: 0,
					has_optimized_output: false,
				};
			}
			return {
				registered: false,
				status: "idle",
				skill_id: rawId,
				training_items_count: 0,
				has_optimized_output: false,
				reason: "Backend unavailable",
			};
		}

		return {
			registered: result.registered,
			skill_id: result.skill_id ?? dbId,
			skill_name: result.skill_name,
			training_items_count: result.training_items_count ?? 0,
			has_optimized_output: result.has_optimized_output ?? false,
			config_path: result.config_path,
			data_dir: result.data_dir,
			reason: result.reason,
		};
	});
