import { Link } from "@tanstack/react-router";
import {
	BarChart2,
	ChevronLeft,
	ChevronRight,
	Library,
	Moon,
	Settings,
	Sun,
	Users,
} from "lucide-react";
import { useState } from "react";

import { useTheme } from "./ThemeContext";

function SkillMakerIcon({ className = "h-5 w-5 shrink-0" }: { className?: string }) {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 -960 960 960"
			fill="currentColor"
			className={className}
		>
			<title>Skill Maker Icon</title>
			<path d="M127-167q-47-47-47-113t47-113q47-47 113-47t113 47q47 47 47 113t-47 113q-47 47-113 47t-113-47Zm480 0q-47-47-47-113t47-113q47-47 113-47t113 47q47 47 47 113t-47 113q-47 47-113 47t-113-47Zm-310.5-56.5Q320-247 320-280t-23.5-56.5Q273-360 240-360t-56.5 23.5Q160-313 160-280t23.5 56.5Q207-200 240-200t56.5-23.5Zm480 0Q800-247 800-280t-23.5-56.5Q753-360 720-360t-56.5 23.5Q640-313 640-280t23.5 56.5Q687-200 720-200t56.5-23.5ZM367-567q-47-47-47-113t47-113q47-47 113-47t113 47q47 47 47 113t-47 113q-47 47-113 47t-113-47Zm169.5-56.5Q560-647 560-680t-23.5-56.5Q513-760 480-760t-56.5 23.5Q400-713 400-680t23.5 56.5Q447-600 480-600t56.5-23.5ZM480-680Zm240 400Zm-480 0Z" />
		</svg>
	);
}

function VibeCodeIcon({ className = "h-5 w-5 shrink-0" }: { className?: string }) {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 -960 960 960"
			fill="currentColor"
			className={className}
		>
			<title>Vibe Code Icon</title>
			<path d="M649-496.5Q737-513 800-540v400q-60 27-146 43.5T480-80q-88 0-174-16.5T160-140v-400q63 27 151 43.5T480-480q81 0 169-16.5ZM720-200v-230q-50 14-115.5 22T480-400q-59 0-124.5-8T240-430v230q50 18 115 29t125 11q60 0 125-11t115-29ZM593-833q47 47 47 113t-47 113q-47 47-113 47t-113-47q-47-47-47-113t47-113q47-47 113-47t113 47Zm-56.5 169.5Q560-687 560-720t-23.5-56.5Q513-800 480-800t-56.5 23.5Q400-753 400-720t23.5 56.5Q447-640 480-640t56.5-23.5ZM480-720Zm0 425Z" />
		</svg>
	);
}

function DeepWikiIcon({ className = "h-5 w-5 shrink-0" }: { className?: string }) {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 -960 960 960"
			fill="currentColor"
			className={className}
		>
			<title>DeepWiki Icon</title>
			<path d="M760-600q-57 0-99-34t-56-86H354q-11 42-41.5 72.5T240-606v251q52 14 86 56t34 99q0 66-47 113T200-40q-66 0-113-47T40-200q0-57 34-99t86-56v-251q-52-14-86-56t-34-98q0-66 47-113t113-47q56 0 98 34t56 86h251q14-52 56-86t99-34q66 0 113 47t47 113q0 66-47 113t-113 47ZM200-120q33 0 56.5-24t23.5-56q0-33-23.5-56.5T200-280q-32 0-56 23.5T120-200q0 32 24 56t56 24Zm0-560q33 0 56.5-23.5T280-760q0-33-23.5-56.5T200-840q-32 0-56 23.5T120-760q0 33 24 56.5t56 23.5ZM760-40q-66 0-113-47t-47-113q0-66 47-113t113-47q66 0 113 47t47 113q0 66-47 113T760-40Zm0-80q33 0 56.5-24t23.5-56q0-33-23.5-56.5T760-280q-33 0-56.5 23.5T680-200q0 32 23.5 56t56.5 24Zm0-560q33 0 56.5-23.5T840-760q0-33-23.5-56.5T760-840q-33 0-56.5 23.5T680-760q0 33 23.5 56.5T760-680ZM200-200Zm0-560Zm560 560Zm0-560Z" />
		</svg>
	);
}

export function Sidebar() {
	const [isOpen, setIsOpen] = useState(false);
	const { isDark, toggleTheme } = useTheme();

	const navItems = [
		{ icon: SkillMakerIcon, label: "Skill Maker", to: "/" },
		{ icon: DeepWikiIcon, label: "DeepWiki", to: "/deepwiki" },
		{ icon: VibeCodeIcon, label: "Vibe Code", to: "/vibecode" },
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
