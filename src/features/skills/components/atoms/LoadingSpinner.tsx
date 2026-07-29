import { Loader2 } from "lucide-react";

interface LoadingSpinnerProps {
	size?: "sm" | "md" | "lg";
	className?: string;
}

export function LoadingSpinner({
	size = "md",
	className = "",
}: LoadingSpinnerProps) {
	const dimension =
		size === "sm" ? "h-4 w-4" : size === "lg" ? "h-8 w-8" : "h-6 w-6";

	return (
		<Loader2
			className={`${dimension} animate-spin text-primary ${className}`}
		/>
	);
}
