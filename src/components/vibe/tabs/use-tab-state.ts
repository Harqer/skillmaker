import { create } from "zustand";

interface TabState {
	activeTab: string;
	setActiveTab: (tab: string) => void;
}

const useTabStateStore = create<TabState>((set) => ({
	activeTab: "chat",
	setActiveTab: (activeTab) => set({ activeTab }),
}));

export function useTabState() {
	const tabId = useTabStateStore((s) => s.activeTab);
	const setTabId = useTabStateStore((s) => s.setActiveTab);
	return [tabId, setTabId] as const;
}
