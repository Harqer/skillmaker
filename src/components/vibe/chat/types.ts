import type { UIMessage } from "ai";

import type { DataPart } from "@/features/vibe/data-parts";
import type { Metadata } from "@/features/vibe/metadata";
import type { ToolSet } from "@/server/vibe/tools";

export type ChatUIMessage = UIMessage<Metadata, DataPart, ToolSet>;
