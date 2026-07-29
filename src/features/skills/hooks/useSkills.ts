import type { Blueprint } from "@/features/skills/types";
import { useSkillsContext } from "../context/SkillsContext";

export function useSkills() {
	const {
		state,
		compileSkill,
		compileBatchSkills,
		seedBlueprint,
		clearError,
		resetCompilation,
	} = useSkillsContext();

	return {
		// Selectors
		status: state.status,
		pollingDbId: state.pollingDbId,
		generationStatus: state.generationStatus,
		telemetry: state.telemetry,
		compiledSkill: state.compiledSkill,
		batchItems: state.batchItems,
		error: state.error,
		seedingBlueprint: state.seedingBlueprint,
		isGenerating: state.status === "generating" || state.status === "polling",
		isSeeding: state.seedingBlueprint !== null,

		// Actions
		compile: (url: string, prompt?: string, includeMcp?: boolean) => {
			const defaultPrompt =
				"Analyze this URL and generate an expert prompt-based AI agent skill with precise instructions and test constraints.";
			return compileSkill(url, prompt || defaultPrompt, includeMcp || false);
		},
		compileBatch: (urls: string[], includeMcp?: boolean) => {
			return compileBatchSkills(urls, includeMcp || false);
		},
		seed: (blueprint: Blueprint) => {
			return seedBlueprint(blueprint);
		},
		clearError,
		reset: resetCompilation,
	};
}

