"use client";

import { FileExplorer as FileExplorerComponent } from "@/components/vibe/file-explorer/file-explorer";
import { useSandboxStore } from "@/features/vibe/state";

interface Props {
	className: string;
}

export function FileExplorer({ className }: Props) {
	const { sandboxId, status, paths, generationCount } = useSandboxStore();
	return (
		<FileExplorerComponent
			className={className}
			disabled={status === "stopped"}
			generationKey={generationCount}
			sandboxId={sandboxId}
			paths={paths}
		/>
	);
}
