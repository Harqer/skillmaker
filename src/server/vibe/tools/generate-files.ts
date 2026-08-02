import { tool, type UIMessageStreamWriter } from "ai";
import z from "zod/v3";

import type { ChatUIMessage } from "@/features/vibe/types";
import { Sandbox } from "../local-sandbox";
import { GENERATE_FILES_DESCRIPTION } from "./descriptions";
import { getContents, type File } from "./generate-files/get-contents";
import { getWriteFiles } from "./generate-files/get-write-files";
import { getRichError } from "./get-rich-error";

interface Params {
	modelId: string;
	writer: UIMessageStreamWriter<ChatUIMessage>;
}

export const generateFiles = ({ writer, modelId }: Params) =>
	tool({
		description: GENERATE_FILES_DESCRIPTION,
		inputSchema: z.object({
			sandboxId: z.string(),
			paths: z.array(z.string()),
		}),
		execute: async ({ sandboxId, paths }, { toolCallId, messages }) => {
			writer.write({
				id: toolCallId,
				type: "data-generating-files",
				data: { paths: [], status: "generating" },
			});

			let sandbox;

			try {
				sandbox = Sandbox.get({ sandboxId });
			} catch (error) {
				const richError = getRichError({
					action: "get sandbox by id",
					args: { sandboxId },
					error,
				});

				writer.write({
					id: toolCallId,
					type: "data-generating-files",
					data: { error: richError.error, paths: [], status: "error" },
				});

				return richError.message;
			}

			const writeFiles = getWriteFiles({ sandbox, toolCallId, writer });
			const iterator = getContents({ messages, modelId, paths });
			const uploaded: File[] = [];

			try {
				for await (const chunk of iterator) {
					if (chunk.files.length > 0) {
						const error = await writeFiles(chunk);
						if (error) {
							return error;
						} else {
							uploaded.push(...chunk.files);
						}
					} else {
						writer.write({
							id: toolCallId,
							type: "data-generating-files",
							data: {
								status: "generating",
								paths: chunk.paths,
							},
						});
					}
				}
			} catch (error) {
				const richError = getRichError({
					action: "generate file contents",
					args: { modelId, paths },
					error,
				});

				writer.write({
					id: toolCallId,
					type: "data-generating-files",
					data: {
						error: richError.error,
						status: "error",
						paths,
					},
				});

				return richError.message;
			}

			writer.write({
				id: toolCallId,
				type: "data-generating-files",
				data: { paths: uploaded.map((file) => file.path), status: "done" },
			});

			return `Successfully generated and uploaded ${
				uploaded.length
			} files. Their paths and contents are as follows:
				${uploaded.map((file) => `Path: ${file.path}\nContent: ${file.content}\n`).join("\n")}`;
		},
	});
