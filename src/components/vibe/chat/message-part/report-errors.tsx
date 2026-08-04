import { BugIcon } from "lucide-react";
import { Streamdown } from "streamdown";

import type { DataPart } from "@/features/vibe/data-parts";
import { ToolHeader } from "../tool-header";
import { ToolMessage } from "../tool-message";

export function ReportErrors({
	message,
}: {
	message: DataPart["report-errors"];
}) {
	return (
		<ToolMessage>
			<ToolHeader>
				<BugIcon className="w-3.5 h-3.5" />
				<span>Auto-detected errors</span>
			</ToolHeader>
			<div className="relative min-h-5">
				<Streamdown>{message.summary}</Streamdown>
			</div>
		</ToolMessage>
	);
}
