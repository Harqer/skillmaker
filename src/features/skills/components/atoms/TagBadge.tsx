interface TagBadgeProps {
	label: string;
}

export function TagBadge({ label }: TagBadgeProps) {
	return (
		<span className="inline-flex items-center rounded-md bg-muted px-2.5 py-1 text-[10px] uppercase tracking-wider font-bold text-foreground/80 border border-border group-hover:border-primary/30 group-hover:bg-primary/5 transition-colors duration-300">
			{label}
		</span>
	);
}
