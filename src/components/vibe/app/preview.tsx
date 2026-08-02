"use client";

import { useSandboxStore } from "@/features/vibe/state";
import { Preview as PreviewComponent } from "@/components/vibe/preview/preview";

interface Props {
	className?: string;
}

export function Preview({ className }: Props) {
	const { status, url, urlUUID } = useSandboxStore();
	return (
		<PreviewComponent
			key={urlUUID}
			className={className}
			disabled={status === "stopped"}
			url={url}
		/>
	);
}
