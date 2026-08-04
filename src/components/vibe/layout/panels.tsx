"use client";

import type { ReactNode } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";

import { HORIZONTAL_COOKIE, VERTICAL_COOKIE } from "./sizing";

interface HProps {
	left: ReactNode;
	right: ReactNode;
	defaultLayout: number[];
}

export function Horizontal({ defaultLayout, left, right }: HProps) {
	const onLayoutChanged = (layout: Record<string, number>) => {
		const sizes = [layout.left ?? 0, layout.right ?? 0];
		document.cookie = `${HORIZONTAL_COOKIE}=${JSON.stringify(sizes)}`;
	};
	return (
		<Group
			orientation="horizontal"
			defaultLayout={{ left: defaultLayout[0], right: defaultLayout[1] }}
			onLayoutChanged={onLayoutChanged}
			className="h-full w-full"
		>
			<Panel id="left">{left}</Panel>
			<Separator className="w-2" />
			<Panel id="right">{right}</Panel>
		</Group>
	);
}

interface VProps {
	defaultLayout: number[];
	top: ReactNode;
	middle: ReactNode;
	bottom: ReactNode;
}

export function Vertical({ defaultLayout, top, middle, bottom }: VProps) {
	const onLayoutChanged = (layout: Record<string, number>) => {
		const sizes = [layout.top ?? 0, layout.middle ?? 0, layout.bottom ?? 0];
		document.cookie = `${VERTICAL_COOKIE}=${JSON.stringify(sizes)}`;
	};
	return (
		<Group
			orientation="vertical"
			defaultLayout={{
				top: defaultLayout[0],
				middle: defaultLayout[1],
				bottom: defaultLayout[2],
			}}
			onLayoutChanged={onLayoutChanged}
			className="h-full w-full"
		>
			<Panel id="top">{top}</Panel>
			<Separator className="h-2" />
			<Panel id="middle">{middle}</Panel>
			<Separator className="h-2" />
			<Panel id="bottom">{bottom}</Panel>
		</Group>
	);
}
