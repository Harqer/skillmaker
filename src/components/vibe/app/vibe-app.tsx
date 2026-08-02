"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { CommandLogsStream } from "@/components/vibe/commands-logs/commands-logs-stream";
import { Horizontal, Vertical } from "@/components/vibe/layout/panels";
import { getHorizontal, getVertical } from "@/components/vibe/layout/sizing";
import { SandboxState } from "@/components/vibe/modals/sandbox-state";
import { Welcome } from "@/components/vibe/modals/welcome";
import { TabContent, TabItem } from "@/components/vibe/tabs";
import { Chat } from "./chat";
import { FileExplorer } from "./file-explorer";
import { Header } from "./header";
import { Logs } from "./logs";
import { Preview } from "./preview";

interface LayoutSizes {
	horizontal: number[];
	vertical: number[];
}

function readCookieStore() {
	return {
		get: (key: string) => {
			const match = document.cookie
				.split("; ")
				.find((row) => row.startsWith(`${key}=`));
			const raw = match ? decodeURIComponent(match.split("=")[1]) : undefined;
			return raw ? { value: raw } : undefined;
		},
	};
}

function useLayoutSizes(): LayoutSizes | null {
	const [sizes, setSizes] = useState<LayoutSizes | null>(null);

	useEffect(() => {
		const store = readCookieStore();
		setSizes({
			horizontal: getHorizontal(store) ?? [50, 50],
			vertical: getVertical(store) ?? [33.33, 33.33, 33.33],
		});
	}, []);

	return sizes;
}

interface Props {
	onBeforeSend?: (text: string) => boolean | Promise<boolean> | undefined;
	headerActions?: ReactNode;
}

export function VibeApp({ onBeforeSend, headerActions }: Props) {
	const sizes = useLayoutSizes();

	if (!sizes) {
		return (
			<div className="flex flex-col h-[calc(100vh-4rem)] max-h-screen overflow-hidden p-2 space-x-2" />
		);
	}

	return (
		<>
			<Welcome />
			<CommandLogsStream />
			<SandboxState />
			<div className="flex flex-col h-[calc(100vh-4rem)] max-h-screen overflow-hidden p-2 space-x-2">
				<Header className="flex items-center w-full" actions={headerActions} />
				<ul className="flex space-x-5 font-mono text-sm tracking-tight px-1 py-2 md:hidden">
					<TabItem tabId="chat">Chat</TabItem>
					<TabItem tabId="preview">Preview</TabItem>
					<TabItem tabId="file-explorer">File Explorer</TabItem>
					<TabItem tabId="logs">Logs</TabItem>
				</ul>

				{/* Mobile layout tabs taking the whole space*/}
				<div className="flex flex-1 w-full overflow-hidden pt-2 md:hidden">
					<TabContent tabId="chat" className="flex-1">
						<Chat
							className="flex-1 overflow-hidden"
							onBeforeSend={onBeforeSend}
						/>
					</TabContent>
					<TabContent tabId="preview" className="flex-1">
						<Preview className="flex-1 overflow-hidden" />
					</TabContent>
					<TabContent tabId="file-explorer" className="flex-1">
						<FileExplorer className="flex-1 overflow-hidden" />
					</TabContent>
					<TabContent tabId="logs" className="flex-1">
						<Logs className="flex-1 overflow-hidden" />
					</TabContent>
				</div>

				{/* Desktop layout with horizontal and vertical panels */}
				<div className="hidden flex-1 w-full min-h-0 overflow-hidden pt-2 md:flex">
					<Horizontal
						defaultLayout={sizes.horizontal}
						left={
							<Chat
								className="flex-1 overflow-hidden"
								onBeforeSend={onBeforeSend}
							/>
						}
						right={
							<Vertical
								defaultLayout={sizes.vertical}
								top={<Preview className="flex-1 overflow-hidden" />}
								middle={<FileExplorer className="flex-1 overflow-hidden" />}
								bottom={<Logs className="flex-1 overflow-hidden" />}
							/>
						}
					/>
				</div>
			</div>
		</>
	);
}
