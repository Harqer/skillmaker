"use client";

import { CommandsLogs } from "@/components/vibe/commands-logs/commands-logs";
import { useSandboxStore } from "@/features/vibe/state";

export function Logs(props: { className?: string }) {
	const { commands } = useSandboxStore();
	return <CommandsLogs className={props.className} commands={commands} />;
}
