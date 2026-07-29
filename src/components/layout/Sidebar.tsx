import { Link } from "@tanstack/react-router";
import {
	BarChart2,
	ChevronLeft,
	ChevronRight,
	Library,
	Moon,
	Settings,
	Sparkles,
	Sun,
	Users,
} from "lucide-react";
import { useState } from "react";

import { useTheme } from "./ThemeContext";

export function Sidebar() {
	const [isOpen, setIsOpen] = useState(false);
	const { isDark, toggleTheme } = useTheme();

	const navItems = [
		{ icon: Sparkles, label: "Compiler", to: "/" },
		{ icon: Library, label: "Library", to: "/library" },
		{ icon: BarChart2, label: "Benchmarks", to: "/benchmarks" },
		{ icon: Users, label: "Community", to: "/explore" },
	];

	return (
		<div
			className={`relative flex flex-col justify-between border-r border-border bg-card transition-all duration-300 ${isOpen ? "w-64" : "w-16"} h-full shrink-0`}
		>
			{/* Toggle Button */}
			<button
				type="button"
				onClick={() => setIsOpen(!isOpen)}
				className="absolute -right-3 top-10 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm hover:text-foreground z-10"
			>
				{isOpen ? (
					<ChevronLeft className="h-4 w-4" />
				) : (
					<ChevronRight className="h-4 w-4" />
				)}
			</button>

			<div className="flex flex-col flex-1 py-6 overflow-hidden">
				<div className="px-3 pb-6 border-b border-border/40 mb-4">
					<Link
						to="/"
						className="flex items-center gap-3 group px-1 text-foreground"
					>
						<img
							src="/peacock_logo.jpg"
							alt="Raven Logo"
							className="h-9 w-9 shrink-0 object-cover rounded-lg border border-border/60 shadow-sm group-hover:scale-105 transition-transform"
						/>
						<span
							className={`font-bold text-base tracking-tight text-foreground transition-opacity duration-300 ${isOpen ? "opacity-100" : "opacity-0 hidden"}`}
						>
							Raven
						</span>
					</Link>
				</div>
				<nav className="flex flex-col gap-2 px-3">
					{navItems.map((item) => (
						<Link
							key={item.label}
							to={item.to}
							className="flex items-center gap-3 px-3 py-2.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors group whitespace-nowrap"
							activeProps={{
								className:
									"bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary font-medium",
							}}
						>
							<item.icon className="h-5 w-5 shrink-0" />
							<span
								className={`text-sm transition-opacity duration-300 ${isOpen ? "opacity-100" : "opacity-0 hidden"}`}
							>
								{item.label}
							</span>
						</Link>
					))}
				</nav>
			</div>

			<div className="flex flex-col gap-2 p-3 border-t border-border">
				<button
					type="button"
					className="flex items-center gap-3 px-3 py-2.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors whitespace-nowrap"
				>
					<Settings className="h-5 w-5 shrink-0" />
					<span
						className={`text-sm transition-opacity duration-300 ${isOpen ? "opacity-100" : "opacity-0 hidden"}`}
					>
						Settings
					</span>
				</button>

				<button
					type="button"
					onClick={toggleTheme}
					className="flex items-center gap-3 px-3 py-2.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors whitespace-nowrap"
				>
					{isDark ? (
						<Sun className="h-5 w-5 shrink-0" />
					) : (
						<Moon className="h-5 w-5 shrink-0" />
					)}
					<span
						className={`text-sm transition-opacity duration-300 ${isOpen ? "opacity-100" : "opacity-0 hidden"}`}
					>
						{isDark ? "Light Mode" : "Dark Mode"}
					</span>
				</button>
			</div>
		</div>
	);
}
