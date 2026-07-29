export interface Skill {
	id: string;
	title: string;
	description: string;
	content: string;
	tags: string[];
	authorId: string;
	upvotes: number;
	createdAt: Date;
}

export interface Blueprint {
	title: string;
	description: string;
	content: string;
	tags: string[];
}

export type CompilationStatus =
	| "idle"
	| "generating"
	| "polling"
	| "completed"
	| "failed";

export interface EventualSyncStatus {
	dbReplicated: boolean;
	vectorIndexed: boolean;
	cdnPushed: boolean;
}

export interface ArchitectureTelemetry {
	partitionNode?: string;
	cacheHit?: boolean;
	cacheType?: string;
	tokensSaved?: number;
	latencyMs?: number;
	eventualSyncStatus?: EventualSyncStatus;
	logs?: string[];
	chainOfThought?: string[];
}

export interface BatchItem {
	url: string;
	dbId: number;
	cacheHit: boolean;
	partitionNode: string;
	title: string;
}

export interface SkillsState {
	status: CompilationStatus;
	pollingDbId: number | null;
	generationStatus: string;
	telemetry: ArchitectureTelemetry | null;
	batchItems: BatchItem[];
	compiledSkill?: Skill | null;
	error: string | null;
	seedingBlueprint: string | null;
}

export type SkillsAction =
	| { type: "START_COMPILATION" }
	| {
			type: "SET_POLLING_ID";
			payload: { dbId: number; partitionNode?: string; cacheHit?: boolean };
	  }
	| {
			type: "UPDATE_POLLING_STATUS";
			payload: { statusText: string; telemetry?: ArchitectureTelemetry };
	  }
	| { type: "SET_BATCH_COMPILATION"; payload: BatchItem[] }
	| { type: "COMPILATION_SUCCESS"; payload: Skill }
	| { type: "COMPILATION_FAILURE"; payload: string }
	| { type: "START_SEEDING"; payload: string }
	| { type: "SEEDING_COMPLETE" }
	| { type: "CLEAR_ERROR" }
	| { type: "RESET_COMPILATION" };
