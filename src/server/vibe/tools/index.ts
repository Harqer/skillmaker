import type { InferUITools, UIMessageStreamWriter } from "ai";

import type { ChatUIMessage } from "@/features/vibe/types";
import { createSandbox } from "./create-sandbox";
import { generateFiles } from "./generate-files";
import { getSandboxURL } from "./get-sandbox-url";
import { runCommand } from "./run-command";

interface Params {
	modelId: string;
	writer: UIMessageStreamWriter<ChatUIMessage>;
}

export function tools({ modelId, writer }: Params) {
	return {
		createSandbox: createSandbox({ writer }),
		generateFiles: generateFiles({ writer, modelId }),
		getSandboxURL: getSandboxURL({ writer }),
		runCommand: runCommand({ writer }),
	};
}

export type ToolSet = InferUITools<ReturnType<typeof tools>>;
