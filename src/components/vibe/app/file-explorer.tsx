"use client";

import { useSandboxStore } from "@/features/vibe/state";
import { FileExplorer as FileExplorerComponent } from "@/components/vibe/file-explorer/file-explorer";

interface Props {
	className: string;
}

export function FileExplorer({ className }: Props) {
	const { sandboxId, status, paths } = useSandboxStore();
	return (
		<FileExplorerComponent
			className={className}
			disabled={status === "stopped"}
			sandboxId={sandboxId}
			paths={paths}
		/>
	);
}
