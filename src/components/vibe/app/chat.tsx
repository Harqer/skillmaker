"use client";

import { useChat } from "@ai-sdk/react";
import { MessageCircleIcon, SendIcon } from "lucide-react";
import { useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Conversation,
	ConversationContent,
	ConversationScrollButton,
} from "@/components/vibe/ai-elements/conversation";
import { Message } from "@/components/vibe/chat/message";
import type { ChatUIMessage } from "@/components/vibe/chat/types";
import { useSharedChatContext } from "@/components/vibe/chat-context";
import { Panel, PanelHeader } from "@/components/vibe/panels/panels";
import { ModelSelector } from "@/components/vibe/settings/model-selector";
import { Settings } from "@/components/vibe/settings/settings";
import { useSettings } from "@/components/vibe/settings/use-settings";
import { TEST_PROMPTS } from "@/features/vibe/constants";
import { useSandboxStore } from "@/features/vibe/state";
import { useLocalStorageValue } from "@/lib/vibe/use-local-storage-value";

interface Props {
	className: string;
	modelId?: string;
	onBeforeSend?: (text: string) => boolean | Promise<boolean> | undefined;
}

export function Chat({ className, onBeforeSend }: Props) {
	const [input, setInput] = useLocalStorageValue("prompt-input");
	const { chat } = useSharedChatContext();
	const { modelId, reasoningEffort } = useSettings();
	const { messages, sendMessage, status } = useChat<ChatUIMessage>({ chat });
	const { setChatStatus } = useSandboxStore();

	const validateAndSubmitMessage = useCallback(
		async (text: string) => {
			if (text.trim()) {
				const proceed = await onBeforeSend?.(text);
				if (proceed === false) {
					return;
				}
				sendMessage({ text }, { body: { modelId, reasoningEffort } });
				setInput("");
			}
		},
		[sendMessage, modelId, setInput, reasoningEffort, onBeforeSend],
	);

	useEffect(() => {
		setChatStatus(status);
	}, [status, setChatStatus]);

	return (
		<Panel className={className}>
			<PanelHeader>
				<div className="flex items-center font-mono font-semibold uppercase">
					<MessageCircleIcon className="mr-2 w-4" />
					Chat
				</div>
				<div className="ml-auto font-mono text-xs opacity-50">[{status}]</div>
			</PanelHeader>

			{messages.length === 0 ? (
				<div className="flex-1 min-h-0">
					<div className="flex flex-col justify-center items-center h-full font-mono text-sm text-muted-foreground">
						<p className="flex items-center font-semibold">
							Click and try one of these prompts:
						</p>
						<ul className="p-4 space-y-1 text-center">
							{TEST_PROMPTS.map((prompt) => (
								<li
									key={prompt}
									className="px-4 py-2 rounded-sm border border-dashed shadow-sm cursor-pointer border-border hover:bg-secondary/50 hover:text-primary"
								>
									<button
										type="button"
										className="w-full cursor-pointer text-inherit"
										onClick={() => validateAndSubmitMessage(prompt)}
									>
										{prompt}
									</button>
								</li>
							))}
						</ul>
					</div>
				</div>
			) : (
				<Conversation className="relative w-full">
					<ConversationContent className="space-y-4">
						{messages.map((message) => (
							<Message key={message.id} message={message} />
						))}
					</ConversationContent>
					<ConversationScrollButton />
				</Conversation>
			)}

			<form
				className="flex items-center p-2 space-x-1 border-t border-primary/18 bg-background"
				onSubmit={async (event) => {
					event.preventDefault();
					validateAndSubmitMessage(input);
				}}
			>
				<Settings />
				<ModelSelector />
				<Input
					className="w-full font-mono text-sm rounded-sm border-0 bg-background"
					disabled={status === "streaming" || status === "submitted"}
					onChange={(e) => setInput(e.target.value)}
					placeholder="Type your message..."
					value={input}
				/>
				<Button type="submit" disabled={status !== "ready" || !input.trim()}>
					<SendIcon className="w-4 h-4" />
				</Button>
			</form>
		</Panel>
	);
}
