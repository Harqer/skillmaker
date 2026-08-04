import { Chat } from "@ai-sdk/react";
import { createContext, useContext, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import type { DataUIPart } from "ai";

import type { DataPart } from "@/features/vibe/data-parts";
import type { ChatUIMessage } from "@/features/vibe/types";
import { useDataStateMapper } from "@/features/vibe/state";

interface ChatContextValue {
	chat: Chat<ChatUIMessage>;
}

const ChatContext = createContext<ChatContextValue | undefined>(undefined);

export function ChatProvider({ children }: { children: ReactNode }) {
	const mapDataToState = useDataStateMapper();
	const mapDataToStateRef = useRef(mapDataToState);
	mapDataToStateRef.current = mapDataToState;

	const chat = useMemo(
		() =>
			new Chat<ChatUIMessage>({
				onData: (data: DataUIPart<DataPart>) =>
					mapDataToStateRef.current(data),
				onError: (error) => {
					console.error("Error sending message:", error);
				},
			}),
		[],
	);

	return (
		<ChatContext.Provider value={{ chat }}>{children}</ChatContext.Provider>
	);
}

export function useSharedChatContext() {
	const context = useContext(ChatContext);
	if (!context) {
		throw new Error("useSharedChatContext must be used within a ChatProvider");
	}
	return context;
}
