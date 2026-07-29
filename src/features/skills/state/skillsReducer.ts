import type {
	SkillsAction,
	SkillsState,
} from "@/features/skills/types";

export const initialSkillsState: SkillsState = {
	status: "idle",
	pollingDbId: null,
	generationStatus: "",
	telemetry: null,
	batchItems: [],
	error: null,
	seedingBlueprint: null,
};

export function skillsReducer(
	state: SkillsState,
	action: SkillsAction,
): SkillsState {
	switch (action.type) {
		case "START_COMPILATION":
			return {
				...state,
				status: "generating",
				pollingDbId: null,
				error: null,
				telemetry: null,
				compiledSkill: null,
				generationStatus: "Enqueuing skill creation request...",
			};

		case "SET_POLLING_ID":
			return {
				...state,
				status: "polling",
				pollingDbId: action.payload.dbId,
				telemetry: {
					partitionNode: action.payload.partitionNode,
					cacheHit: action.payload.cacheHit,
				},
				generationStatus: action.payload.cacheHit
					? "0-Token Interception: Served directly from Canonical Skill Cache."
					: "Request enqueued on worker partition ring. Telemetry streaming...",
			};

		case "UPDATE_POLLING_STATUS":
			return {
				...state,
				generationStatus: action.payload.statusText,
				telemetry: action.payload.telemetry
					? { ...state.telemetry, ...action.payload.telemetry }
					: state.telemetry,
			};

		case "SET_BATCH_COMPILATION":
			return {
				...state,
				batchItems: action.payload,
			};

		case "COMPILATION_SUCCESS":
			return {
				...state,
				status: "completed",
				compiledSkill: action.payload,
				pollingDbId: null,
				generationStatus: "Expert skill compiled and synced successfully!",
			};

		case "COMPILATION_FAILURE":
			return {
				...state,
				status: "failed",
				pollingDbId: null,
				generationStatus: "",
				error: action.payload,
			};

		case "START_SEEDING":
			return {
				...state,
				seedingBlueprint: action.payload,
			};

		case "SEEDING_COMPLETE":
			return {
				...state,
				seedingBlueprint: null,
			};

		case "CLEAR_ERROR":
			return {
				...state,
				error: null,
			};

		case "RESET_COMPILATION":
			return {
				...initialSkillsState,
			};

		default:
			return state;
	}
}

