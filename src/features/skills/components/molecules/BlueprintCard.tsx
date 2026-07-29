import { ArrowRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import type { Blueprint } from "@/features/skills/types";
import { LoadingSpinner } from "../atoms/LoadingSpinner";

interface BlueprintCardProps {
	blueprint: Blueprint;
	isSeeding: boolean;
	onCustomize: (bp: Blueprint) => void;
	onInstantPublish: (bp: Blueprint) => void;
}

export function BlueprintCard({
	blueprint,
	isSeeding,
	onCustomize,
	onInstantPublish,
}: BlueprintCardProps) {
	return (
		<Card className="flex flex-col border border-border/80 bg-card hover:border-primary/50 transition-all duration-300 shadow-sm relative overflow-hidden group">
			<div className="absolute top-0 left-0 w-full h-[3px] bg-primary/40" />
			<CardHeader className="flex-1 pb-4">
				<div className="flex items-center justify-between mb-2">
					<span className="text-[10px] font-bold uppercase tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
						{blueprint.tags[0] || "Agent"}
					</span>
				</div>
				<CardTitle className="text-lg font-bold">{blueprint.title}</CardTitle>
				<CardDescription className="text-xs leading-relaxed mt-1">
					{blueprint.description}
				</CardDescription>
			</CardHeader>
			<CardContent className="pt-0 pb-6 flex flex-col gap-3">
				<Button
					variant="outline"
					size="sm"
					onClick={() => onCustomize(blueprint)}
					className="w-full text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5"
				>
					Customize & Edit
					<ArrowRight className="w-3 h-3 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
				</Button>
				<Button
					disabled={isSeeding}
					onClick={() => onInstantPublish(blueprint)}
					className="w-full text-xs font-semibold h-9 bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary-dark transition-colors"
				>
					{isSeeding ? (
						<LoadingSpinner size="sm" className="mx-auto" />
					) : (
						<>
							<Plus className="w-3.5 h-3.5 mr-1.5 inline animate-pulse" />
							Load & Publish Live
						</>
					)}
				</Button>
			</CardContent>
		</Card>
	);
}
