"use client";

import { XIcon } from "lucide-react";
import { useState } from "react";

interface Props {
	defaultOpen: boolean;
	onDismiss: () => void;
}

export function Banner({ defaultOpen, onDismiss }: Props) {
	const [open, setOpen] = useState(defaultOpen);
	if (!open) {
		return null;
	}

	return (
		<div className="relative full text-xs border border-dashed border-yellow-500 bg-yellow-100 py-2 pl-2 pr-8">
			<strong>ABSO Coding Agent demo</strong> This demo showcases a
			full-stack coding agent built with TanStack Start, the AI SDK, and a
			local sandbox.
			<button
				aria-label="Close Banner"
				className="absolute top-2 right-2 text-yellow-700 hover:text-yellow-900 transition-colors cursor-pointer"
				onClick={() => {
					onDismiss();
					setOpen(false);
				}}
			>
				<XIcon className="w-4 h-4" />
			</button>
		</div>
	);
}
