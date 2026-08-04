"use client";

import { InfoIcon } from "lucide-react";
import { useEffect } from "react";
import { create } from "zustand";

import { Button } from "@/components/ui/button";

interface State {
	open: boolean | undefined;
	setOpen: (open: boolean) => void;
}

export const useWelcomeStore = create<State>((set) => ({
	open: undefined,
	setOpen: (open) => set({ open }),
}));

const BANNER_KEY = "vibe-banner-hidden";

export function Welcome() {
	const { open, setOpen } = useWelcomeStore();

	useEffect(() => {
		const hidden = localStorage.getItem(BANNER_KEY) === "true";
		setOpen(!hidden);
	}, [setOpen]);

	if (open === false || open === undefined) {
		return null;
	}

	const handleDismiss = () => {
		localStorage.setItem(BANNER_KEY, "true");
		setOpen(false);
	};

	return (
		<div className="fixed w-screen h-screen z-10">
			<div className="absolute w-full h-full bg-secondary opacity-60" />
			<div
				className="relative w-full h-full flex items-center justify-center"
				onClick={handleDismiss}
			>
				<div
					className="bg-background max-w-xl mx-4 rounded-lg shadow overflow-hidden"
					onClick={(event) => event.stopPropagation()}
				>
					<div className="p-6 space-y-4 ">
						<h1 className="text-2xl sans-serif font-semibold tracking-tight mb-7">
							ABSO Vibe Coding Platform
						</h1>
						<p className="text-base text-primary">
							This is a <strong>demo</strong> of an end-to-end coding
							platform where the user can enter text prompts, and the
							agent will create a full stack application.
						</p>
						<p className="text-base text-secondary-foreground">
							It uses the AI SDK for agent orchestration and model
							support, and a local sandbox for secure code execution,
							all built with TanStack Start and Bun.
						</p>
					</div>
					<footer className="bg-secondary flex justify-end p-4 border-t border-border">
						<Button className="cursor-pointer" onClick={handleDismiss}>
							Try now
						</Button>
					</footer>
				</div>
			</div>
		</div>
	);
}

export function ToggleWelcome() {
	const { open, setOpen } = useWelcomeStore();
	return (
		<Button
			className="cursor-pointer"
			onClick={() => setOpen(!open)}
			variant="outline"
			size="sm"
		>
			<InfoIcon />{" "}
			<span className="hidden lg:inline">What&apos;s this?</span>
		</Button>
	);
}
