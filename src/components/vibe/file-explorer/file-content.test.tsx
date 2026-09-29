// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { SWRConfig } from "swr";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FileContent } from "./file-content";

interface Deferred {
	resolve: (body: string) => void;
}

function mockFetch() {
	const urls: string[] = [];
	const pending: Deferred[] = [];
	const fetchMock = vi.fn((input: RequestInfo | URL) => {
		urls.push(String(input));
		return new Promise<Response>((resolve) => {
			pending.push({
				resolve: (body: string) => resolve(new Response(body, { status: 200 })),
			});
		});
	});
	vi.stubGlobal("fetch", fetchMock);
	return { urls, pending };
}

function renderFileContent(generationKey: number) {
	return render(
		<SWRConfig value={{ provider: () => new Map() }}>
			<FileContent
				sandboxId="sbx"
				path="src/app.tsx"
				generationKey={generationKey}
			/>
		</SWRConfig>,
	);
}

beforeEach(() => {
	vi.unstubAllGlobals();
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("FileContent", () => {
	it("requests the file path without the generation key in the URL", async () => {
		const { urls, pending } = mockFetch();

		renderFileContent(7);
		await waitFor(() => expect(pending.length).toBe(1));

		expect(urls[0]).toBe("/api/vibe/sandboxes/sbx/files?path=src%2Fapp.tsx");
	});

	it("keeps rendering the current file while a generation refetch is in flight", async () => {
		const { pending } = mockFetch();

		const { rerender } = renderFileContent(1);
		await waitFor(() => expect(pending.length).toBe(1));
		pending[0].resolve("const before = 1;");
		await waitFor(() => expect(screen.getByText(/const/)).toBeDefined());

		rerender(
			<SWRConfig value={{ provider: () => new Map() }}>
				<FileContent sandboxId="sbx" path="src/app.tsx" generationKey={2} />
			</SWRConfig>,
		);

		await waitFor(() => expect(pending.length).toBe(2));
		expect(screen.getByText(/before/)).toBeDefined();

		pending[1].resolve("const after = 2;");
		await waitFor(() => expect(screen.getByText(/after/)).toBeDefined());
	});

	it("shows an error notice instead of the response body when the read fails", async () => {
		const fetchMock = vi.fn(
			async () =>
				new Response(JSON.stringify({ error: "File not found" }), {
					status: 404,
				}),
		);
		vi.stubGlobal("fetch", fetchMock);

		renderFileContent(0);

		await waitFor(() =>
			expect(screen.getByText(/Unable to load/)).toBeDefined(),
		);
		expect(screen.queryByText(/File not found/)).toBeNull();
	});
});
