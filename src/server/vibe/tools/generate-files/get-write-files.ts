import type { UIMessageStreamWriter } from "ai";

import type { ChatUIMessage } from "@/features/vibe/types";
import type { LocalSandbox } from "../../local-sandbox";
import { getRichError } from "../get-rich-error";
import type { File } from "./get-contents";

interface Params {
	sandbox: LocalSandbox;
	toolCallId: string;
	writer: UIMessageStreamWriter<ChatUIMessage>;
}

export function getWriteFiles({ sandbox, toolCallId, writer }: Params) {
	return async function writeFiles(params: {
		written: string[];
		files: File[];
		paths: string[];
	}) {
		const paths = params.written.concat(params.files.map((file) => file.path));
		writer.write({
			id: toolCallId,
			type: "data-generating-files",
			data: { paths, status: "uploading" },
		});

		try {
			await sandbox.writeFiles(
				params.files.map((file) => ({
					content: Buffer.from(file.content, "utf8"),
					path: file.path,
				})),
			);
		} catch (error) {
			const richError = getRichError({
				action: "write files to sandbox",
				args: params,
				error,
			});

			writer.write({
				id: toolCallId,
				type: "data-generating-files",
				data: {
					error: richError.error,
					status: "error",
					paths: params.paths,
				},
			});

			return richError.message;
		}

		writer.write({
			id: toolCallId,
			type: "data-generating-files",
			data: { paths, status: "uploaded" },
		});
	};
}
