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
	const content = useSWR(
		`/api/vibe/sandboxes/${sandboxId}/files?${searchParams.toString()}:${generationKey ?? 0}`,
		async (pathname: string, init: RequestInit) => {
			const response = await fetch(pathname, init);
			const text = await response.text();
			return text;
		},
		{ revalidateOnFocus: false },
	);

	if (content.isLoading || !content.data) {
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
