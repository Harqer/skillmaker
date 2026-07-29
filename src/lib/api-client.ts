const FASTAPI_URL = process.env.FASTAPI_URL || process.env.VITE_FASTAPI_URL || "http://localhost:8000";

interface ApiError {
	error: string;
}

async function apiPost<T>(
	path: string,
	body: unknown,
	authToken?: string,
): Promise<T & { error?: string }> {
	try {
		const headers: Record<string, string> = {
			"Content-Type": "application/json",
		};
		if (authToken) {
			headers["Authorization"] = `Bearer ${authToken}`;
		}
		const res = await fetch(`${FASTAPI_URL}${path}`, {
			method: "POST",
			headers,
			body: JSON.stringify(body),
		});
		if (!res.ok) {
			const text = await res.text();
			return { error: `API error ${res.status}: ${text}` } as T & {
				error: string;
			};
		}
		return res.json();
	} catch (err) {
		return {
			error: err instanceof Error ? err.message : String(err),
		} as T & { error: string };
	}
}

async function apiGet<T>(
	path: string,
	authToken?: string,
): Promise<T & { error?: string }> {
	try {
		const headers: Record<string, string> = {};
		if (authToken) {
			headers["Authorization"] = `Bearer ${authToken}`;
		}
		const res = await fetch(`${FASTAPI_URL}${path}`, { headers });
		if (!res.ok) {
			const text = await res.text();
			return { error: `API error ${res.status}: ${text}` } as T & {
				error: string;
			};
		}
		return res.json();
	} catch (err) {
		return {
			error: err instanceof Error ? err.message : String(err),
		} as T & { error: string };
	}
}

// --- Types matching FastAPI backend responses ---

export interface GenerateSkillResponse {
	status: string;
	job_id?: string;
	thread_id?: string;
	db_id?: number;
	error?: string;
}

export interface SkillRequestResponse {
	status: string;
	error?: string | null;
	trace_url?: string | null;
	url?: string;
	createdSkill?: {
		folderName?: string;
		displayName?: string;
		description?: string;
		files?: {
			"SKILL.md"?: string | null;
			mcp_server?: string | null;
			mcp_config?: string | null;
		};
	} | null;
}

export interface EvaluateSkillResponse {
	score?: number;
	feedback?: string;
	improvements?: string[];
	error?: string;
}

export interface SkillOptTrainResponse {
	status: string;
	skill_name?: string;
	adopted_count?: number;
	staged_count?: number;
	score_before?: number;
	score_after?: number;
	training_items_count?: number;
	trajectory_insights?: string[];
	optimized_content?: string;
	best_skill_path?: string;
	reason?: string;
	error?: string;
}

export interface SkillOptStatusResponse {
	skill_id?: number;
	skill_name?: string;
	registered: boolean;
	training_items_count?: number;
	has_optimized_output?: boolean;
	config_path?: string | null;
	data_dir?: string | null;
	reason?: string;
}

// --- API Client Methods ---

export async function generateSkill(
	urls: string | string[],
	prompt: string,
	includeMcp: boolean,
	authToken?: string,
): Promise<GenerateSkillResponse & { error?: string }> {
	const urlList = Array.isArray(urls) ? urls : [urls];
	return apiPost<GenerateSkillResponse>(
		"/api/generate_skill",
		{ urls: urlList, prompt, include_mcp: includeMcp },
		authToken,
	);
}

export async function getSkillRequest(
	dbId: number,
	authToken?: string,
): Promise<SkillRequestResponse & { error?: string }> {
	return apiGet<SkillRequestResponse>(
		`/api/skill_request/${dbId}`,
		authToken,
	);
}

export async function evaluateSkill(
	prompt: string,
	skillContent: string,
	assertions: string[],
	authToken?: string,
): Promise<EvaluateSkillResponse & { error?: string }> {
	return apiPost<EvaluateSkillResponse>(
		"/api/evaluate_skill",
		{ prompt, skill_content: skillContent, assertions },
		authToken,
	);
}

export async function triggerSkillOptTraining(
	dbId: number,
	authToken?: string,
): Promise<SkillOptTrainResponse & { error?: string }> {
	return apiPost<SkillOptTrainResponse>(
		`/api/skillopt/train/${dbId}`,
		{},
		authToken,
	);
}

export async function getSkillOptStatus(
	dbId: number,
	authToken?: string,
): Promise<SkillOptStatusResponse & { error?: string }> {
	return apiGet<SkillOptStatusResponse>(
		`/api/skillopt/status/${dbId}`,
		authToken,
	);
}
