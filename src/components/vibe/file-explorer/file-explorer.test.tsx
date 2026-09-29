// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { FileExplorer } from "./file-explorer";

beforeAll(() => {
	if (!("ResizeObserver" in globalThis)) {
		globalThis.ResizeObserver = class {
			observe() {}
			unobserve() {}
			disconnect() {}
		} as unknown as typeof ResizeObserver;
	}
});

afterEach(cleanup);

describe("FileExplorer", () => {
	it("auto-expands folders on first render", () => {
		render(<FileExplorer className="" paths={["src/app.tsx"]} />);

		expect(screen.getByText("src")).toBeDefined();
		expect(screen.queryByText("app.tsx")).not.toBeNull();
	});

	it("keeps a folder the user collapsed collapsed when new paths arrive", () => {
		const { rerender } = render(
			<FileExplorer className="" paths={["src/app.tsx"]} />,
		);

		fireEvent.click(screen.getByText("src"));
		expect(screen.queryByText("app.tsx")).toBeNull();

		rerender(
			<FileExplorer className="" paths={["src/app.tsx", "src/lib/util.ts"]} />,
		);

		expect(screen.queryByText("app.tsx")).toBeNull();
		expect(screen.queryByText("lib")).toBeNull();
	});

	it("auto-expands newly arrived folders once their parent is reopened", () => {
		const { rerender } = render(
			<FileExplorer className="" paths={["src/app.tsx"]} />,
		);

		fireEvent.click(screen.getByText("src"));
		rerender(
			<FileExplorer className="" paths={["src/app.tsx", "src/lib/util.ts"]} />,
		);
		fireEvent.click(screen.getByText("src"));

		expect(screen.queryByText("lib")).not.toBeNull();
		expect(screen.queryByText("util.ts")).not.toBeNull();
	});
});
