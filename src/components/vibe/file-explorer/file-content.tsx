import { memo } from "react";
import * as Spinners from "react-spinners";
import useSWR from "swr";

import { SyntaxHighlighter } from "./syntax-highlighter";

const { PulseLoader } = Spinners;

interface Props {
	sandboxId: string;
	path: string;
	generationKey?: number;
}

export const FileContent = memo(function FileContent({
	sandboxId,
	path,
	generationKey,
}: Props) {
	const searchParams = new URLSearchParams({ path });
	const url = `/api/vibe/sandboxes/${sandboxId}/files?${searchParams.toString()}`;
	const content = useSWR(
		[url, generationKey ?? 0] as const,
		async ([pathname]: readonly [string, number]) => {
			const response = await fetch(pathname, { cache: "no-store" });
			const text = await response.text();
			if (!response.ok) {
				throw new Error(
					text || `Request failed with status ${response.status}`,
				);
			}
			return text;
		},
		{ keepPreviousData: true, revalidateOnFocus: false },
	);

	if (content.error) {
		return (
			<div className="p-4 font-mono text-sm text-red-600">
				Unable to load {path}
			</div>
		);
	}

	if (content.isLoading || content.data === undefined) {
		return (
			<div className="absolute w-full h-full flex items-center text-center">
				<div className="flex-1">
					<PulseLoader className="opacity-60" size={8} />
				</div>
			</div>
		);
	}

	return <SyntaxHighlighter path={path} code={content.data} />;
});
