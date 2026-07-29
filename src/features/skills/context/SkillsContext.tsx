import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useReducer,
} from "react";
import type { Blueprint, Skill, SkillsState } from "@/features/skills/types";
import {
	generateBatchSkillsFromUrls,
	generateSkillFromUrl,
	getGenerationStatus,
} from "@/server/ai";
import { createSkill } from "@/server/skills";
import { initialSkillsState, skillsReducer } from "../state/skillsReducer";

interface SkillsContextType {
	state: SkillsState;
	compileSkill: (
		url: string,
		prompt: string,
		includeMcp: boolean,
	) => Promise<void>;
	compileBatchSkills: (urls: string[], includeMcp: boolean) => Promise<void>;
	seedBlueprint: (blueprint: Blueprint) => Promise<string | undefined>;
	clearError: () => void;
	resetCompilation: () => void;
}

const SkillsContext = createContext<SkillsContextType | undefined>(undefined);

export function SkillsProvider({ children }: { children: ReactNode }) {
	const [state, dispatch] = useReducer(skillsReducer, initialSkillsState);
	const router = useRouter();

	const generateFn = useServerFn(generateSkillFromUrl);
	const generateBatchFn = useServerFn(generateBatchSkillsFromUrls);
	const pollStatusFn = useServerFn(getGenerationStatus);
	const createSkillFn = useServerFn(createSkill);

	const compileSkill = async (
		url: string,
		prompt: string,
		includeMcp: boolean,
	) => {
		dispatch({ type: "START_COMPILATION" });
		try {
			const res = await generateFn({
				data: {
					url,
					prompt,
					include_mcp: includeMcp,
				},
			});

			if (res.status === "enqueued" && res.db_id) {
				dispatch({
					type: "SET_POLLING_ID",
					payload: {
						dbId: res.db_id,
						partitionNode: res.partitionNode,
						cacheHit: res.cacheHit,
					},
				});
			} else {
				throw new Error("API did not return a valid task job queue ID.");
			}
		} catch (err) {
			const error = err as Error;
			dispatch({
				type: "COMPILATION_FAILURE",
				payload:
					error.message || "Failed to trigger the agent skill compilation.",
			});
		}
	};

	const compileBatchSkills = async (urls: string[], includeMcp: boolean) => {
		dispatch({ type: "START_COMPILATION" });
		try {
			const res = await generateBatchFn({
				data: {
					urls,
					include_mcp: includeMcp,
				},
			});

			if (res.items && res.items.length > 0) {
				dispatch({ type: "SET_BATCH_COMPILATION", payload: res.items });
				// Track the first pending or non-canonical item
				const pendingItem = res.items.find((i) => !i.cacheHit) || res.items[0];
				dispatch({
					type: "SET_POLLING_ID",
					payload: {
						dbId: pendingItem.dbId,
						partitionNode: pendingItem.partitionNode,
						cacheHit: pendingItem.cacheHit,
					},
				});
			}
		} catch (err) {
			const error = err as Error;
			dispatch({
				type: "COMPILATION_FAILURE",
				payload: error.message || "Failed to trigger batch URL compilation.",
			});
		}
	};

	const seedBlueprint = async (blueprint: Blueprint) => {
		dispatch({ type: "START_SEEDING", payload: blueprint.title });
		try {
			const res = await createSkillFn({ data: blueprint });
			router.invalidate();
			return res?.skillId;
		} catch (err) {
			console.error("Failed to seed blueprint:", err);
		} finally {
			dispatch({ type: "SEEDING_COMPLETE" });
		}
		return undefined;
	};

	const clearError = () => dispatch({ type: "CLEAR_ERROR" });
	const resetCompilation = () => dispatch({ type: "RESET_COMPILATION" });

	// Polling telemetry loop
	useEffect(() => {
		const pollingId = state.pollingDbId;
		if (state.status !== "polling" || !pollingId) return;

		let isCancelled = false;

		const checkStatus = async () => {
			try {
				const res = await pollStatusFn({ data: pollingId });
				if (isCancelled) return;

				dispatch({
					type: "UPDATE_POLLING_STATUS",
					payload: {
						statusText: res.progressStep || `Compiler status: ${res.status}`,
						telemetry: {
							partitionNode: res.partitionNode,
							cacheHit: res.cacheHit,
							cacheType: res.cacheType,
							tokensSaved: res.tokensSaved,
							latencyMs: res.latencyMs,
							eventualSyncStatus: res.eventualSyncStatus,
							logs: res.logs,
							chainOfThought: res.chainOfThought,
						},
					},
				});

				if (res.status === "completed") {
					if (res.createdSkill) {
						try {
							localStorage.setItem(
								"pendingGeneratedSkill",
								JSON.stringify(res.createdSkill),
							);
						} catch (e) {
							console.error("Failed to cache compiled skill:", e);
						}
						dispatch({
							type: "COMPILATION_SUCCESS",
							payload: res.createdSkill as unknown as Skill,
						});
						router.invalidate();
					} else {
						dispatch({
							type: "COMPILATION_FAILURE",
							payload:
								"Skill was marked complete but no file outputs were found.",
						});
					}
				} else if (res.status === "failed") {
					dispatch({
						type: "COMPILATION_FAILURE",
						payload:
							res.error ||
							"The autonomous builder encountered a compilation error.",
					});
				}
			} catch {
				if (!isCancelled) {
					dispatch({
						type: "COMPILATION_FAILURE",
						payload:
							"Telemetry connection to the background agent compiler was lost.",
					});
				}
			}
		};

		// Immediate check on mount
		checkStatus();

		const intervalId = setInterval(checkStatus, 800);

		return () => {
			isCancelled = true;
			clearInterval(intervalId);
		};
	}, [state.status, state.pollingDbId, pollStatusFn, router]);

	return (
		<SkillsContext.Provider
			value={{
				state,
				compileSkill,
				compileBatchSkills,
				seedBlueprint,
				clearError,
				resetCompilation,
			}}
		>
			{children}
		</SkillsContext.Provider>
	);
}

export function useSkillsContext() {
	const context = useContext(SkillsContext);
	if (!context) {
		throw new Error("useSkillsContext must be used within a SkillsProvider");
	}
	return context;
}
