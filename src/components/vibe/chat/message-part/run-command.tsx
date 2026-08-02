import { CheckIcon, SquareChevronRightIcon, XIcon } from "lucide-react";
import { Streamdown } from "streamdown";

import type { DataPart } from "@/features/vibe/data-parts";
import { Spinner } from "./spinner";
import { ToolHeader } from "../tool-header";
import { ToolMessage } from "../tool-message";

export function RunCommand({ message }: { message: DataPart["run-command"] }) {
	return (
		<ToolMessage>
			<ToolHeader>
				<SquareChevronRightIcon className="w-3.5 h-3.5" />
				{message.status === "executing" && "Executing"}
				{message.status === "waiting" && "Waiting"}
				{message.status === "running" && "Running in background"}
				{message.status === "done" && message.exitCode !== 1 && "Finished"}
				{message.status === "done" && message.exitCode === 1 && "Errored"}
				{message.status === "error" && "Errored"}
			</ToolHeader>
			<div className="relative pl-6">
				<Spinner
					className="absolute left-0 top-0"
					loading={["executing", "waiting"].includes(message.status)}
				>
					{(message.exitCode && message.exitCode > 0) ||
					message.status === "error" ? (
						<XIcon className="w-4 h-4 text-red-700" />
					) : (
						<CheckIcon className="w-4 h-4" />
					)}
				</Spinner>
				<Streamdown>{`\`${message.command} ${message.args.join(" ")}\``}</Streamdown>
			</div>
		</ToolMessage>
	);
}
