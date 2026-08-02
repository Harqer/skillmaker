import * as Spinners from "react-spinners";

import { cn } from "@/lib/utils";

const { PulseLoader } = Spinners;

export function MessageSpinner({ className }: { className?: string }) {
	return <PulseLoader className={cn("opacity-60", className)} size={5} />;
}
