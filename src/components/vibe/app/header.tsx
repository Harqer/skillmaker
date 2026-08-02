import type { ReactNode } from "react";

import { ToggleWelcome } from "@/components/vibe/modals/welcome";
import { cn } from "@/lib/utils";

interface Props {
	className?: string;
	actions?: ReactNode;
}

export function Header({ className, actions }: Props) {
	return (
		<header className={cn("flex items-center justify-between", className)}>
			<div className="flex items-center">
				<span className="hidden md:inline text-sm uppercase font-mono font-bold tracking-tight">
					ABSO Vibe Coding Platform
				</span>
			</div>
			<div className="flex items-center ml-auto space-x-1.5">
				{actions}
				<ToggleWelcome />
			</div>
		</header>
	);
}
