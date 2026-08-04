import { create } from "zustand";
import { persist } from "zustand/middleware";

import { DEFAULT_MODEL } from "@/features/vibe/constants";

export type ReasoningEffort = "medium" | "low";

interface SettingsState {
	modelId: string;
	fixErrors: boolean;
	reasoningEffort: ReasoningEffort;
	setModelId: (modelId: string) => void;
	setFixErrors: (fixErrors: boolean) => void;
	setReasoningEffort: (reasoningEffort: ReasoningEffort) => void;
}

export const useSettingsStore = create<SettingsState>()(
	persist(
		(set) => ({
			modelId: DEFAULT_MODEL,
			fixErrors: true,
			reasoningEffort: "low",
			setModelId: (modelId) => set({ modelId }),
			setFixErrors: (fixErrors) => set({ fixErrors }),
			setReasoningEffort: (reasoningEffort) => set({ reasoningEffort }),
		}),
		{ name: "vibe-settings" },
	),
);

export function useSettings() {
	const modelId = useSettingsStore((s) => s.modelId);
	const fixErrors = useSettingsStore((s) => s.fixErrors);
	const reasoningEffort = useSettingsStore((s) => s.reasoningEffort);
	return { modelId, fixErrors, reasoningEffort };
}

export function useModelId(): [string, (modelId: string) => void] {
	const modelId = useSettingsStore((s) => s.modelId);
	const setModelId = useSettingsStore((s) => s.setModelId);
	return [modelId, setModelId];
}

export function useReasoningEffort(): [
	ReasoningEffort,
	(effort: ReasoningEffort) => void,
] {
	const reasoningEffort = useSettingsStore((s) => s.reasoningEffort);
	const setReasoningEffort = useSettingsStore((s) => s.setReasoningEffort);
	return [reasoningEffort, setReasoningEffort];
}

export function useFixErrors(): [boolean, (fixErrors: boolean) => void] {
	const fixErrors = useSettingsStore((s) => s.fixErrors);
	const setFixErrors = useSettingsStore((s) => s.setFixErrors);
	return [fixErrors, setFixErrors];
}
