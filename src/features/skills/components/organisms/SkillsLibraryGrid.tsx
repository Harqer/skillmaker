import { useNavigate } from "@tanstack/react-router";
import {
	Activity,
	BookOpen,
	Compass,
	Cpu,
	ExternalLink,
	FolderPlus,
	GitBranch,
	RefreshCw,
	Sparkles,
	Users,
} from "lucide-react";
import { SignedIn } from "@/components/auth/ClerkHelpers";
import SkillCard from "@/components/skills/SkillCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import type { Skill } from "@/features/skills/types";
import { backendPlatforms } from "@/lib/db";

interface SkillsLibraryGridProps {
	mySkills: Skill[];
	communitySkills: Skill[];
}

export function SkillsLibraryGrid({
	mySkills,
	communitySkills,
}: SkillsLibraryGridProps) {
	const navigate = useNavigate();

	return (
		<div className="space-y-16 w-full">
			{/* Backend Platform & Orchestration Architecture Panel */}
			<div className="space-y-6 pt-6 border-t border-border/40">
				<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
					<div className="space-y-1">
						<div className="flex items-center gap-2">
							<Badge
								variant="outline"
								className="bg-primary/10 text-primary border-primary/20 font-mono text-[10px] uppercase tracking-wider px-2 py-0.5"
							>
								System Architecture
							</Badge>
							<span className="text-xs text-muted-foreground font-mono">
								Stage 1-3 Infrastructure
							</span>
						</div>
						<h2 className="text-2xl font-bold font-serif text-foreground tracking-tight flex items-center gap-2">
							<Cpu className="h-5 w-5 text-primary" /> Backend Orchestration &
							Pipeline Engines
						</h2>
						<p className="text-sm text-muted-foreground font-medium">
							Raven, Loop Engineering, and SkillOpt form the backend engine pipeline that ingests documentation URLs and outputs structured EVE skills.
						</p>
					</div>
				</div>

				<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
					{backendPlatforms.map((engine) => (
						<Card
							key={engine.id}
							className="border border-border/80 bg-card/60 backdrop-blur-sm hover:border-primary/40 transition-all duration-300 relative overflow-hidden group flex flex-col"
						>
							<div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-bl-full pointer-events-none group-hover:bg-primary/10 transition-colors" />
							<CardHeader className="p-5 pb-3">
								<div className="flex items-center justify-between mb-2">
									<div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
										{engine.id.includes("raven") && (
											<Sparkles className="w-4 h-4" />
										)}
										{engine.id.includes("loop") && (
											<RefreshCw className="w-4 h-4" />
										)}
										{engine.id.includes("skillopt") && (
											<Activity className="w-4 h-4" />
										)}
									</div>
									<Badge
										variant="secondary"
										className="text-[10px] font-mono bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
									>
										{engine.status}
									</Badge>
								</div>
								<CardTitle className="text-base font-bold font-serif leading-tight">
									{engine.name}
								</CardTitle>
								<div className="text-xs font-mono font-medium text-primary mt-0.5">
									{engine.role}
								</div>
							</CardHeader>
							<CardContent className="p-5 pt-0 flex-1 flex flex-col justify-between">
								<CardDescription className="text-xs text-muted-foreground leading-relaxed">
									{engine.description}
								</CardDescription>
								<div className="mt-4 pt-3 border-t border-border/40 flex items-center justify-between">
									<a
										href={engine.sourceUrl}
										target="_blank"
										rel="noreferrer"
										className="inline-flex items-center text-[11px] font-mono text-muted-foreground hover:text-primary transition-colors"
									>
										<GitBranch className="w-3 h-3 mr-1" /> Source Code
										<ExternalLink className="w-2.5 h-2.5 ml-1 opacity-70" />
									</a>
									<span className="text-[10px] font-mono text-muted-foreground/80">
										EVE Compliant
									</span>
								</div>
							</CardContent>
						</Card>
					))}
				</div>
			</div>

			{/* Personal Library Section (My Library) */}
			<div className="space-y-6 pt-6 border-t border-border/40">
				<div className="flex items-center justify-between">
					<div className="space-y-1">
						<h2 className="text-2xl font-bold font-serif text-foreground tracking-tight flex items-center gap-2">
							<BookOpen className="h-5 w-5 text-primary" /> My Domain Skills
						</h2>
						<p className="text-sm text-muted-foreground font-medium">
							Your personal collection of domain expertise skills generated from URL documentation inputs.
						</p>
						<p className="text-xs text-muted-foreground italic">
							* Must be signed in to save and access your personal library.
						</p>
					</div>
					<div className="flex items-center gap-3">
						<SignedIn suppressHydrationWarning>
							{mySkills.length > 0 && (
								<span className="text-xs bg-primary/10 text-primary border border-primary/25 px-2.5 py-1 rounded-full font-bold">
									{mySkills.length} Verified{" "}
									{mySkills.length === 1 ? "Skill" : "Skills"}
								</span>
							)}
						</SignedIn>
					</div>
				</div>

				{mySkills.length > 0 ? (
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
						{mySkills.map((skill) => (
							<SkillCard
								key={skill.id}
								id={skill.id}
								title={skill.title}
								description={skill.description}
								content={skill.content}
								authorName={
									skill.authorId === "guest_user" ? "You (Guest)" : "You"
								}
								tags={skill.tags}
								upvotes={skill.upvotes}
							/>
						))}
					</div>
				) : (
					<div className="bg-card border border-border/85 rounded-2xl p-8 shadow-sm flex flex-col md:flex-row items-center justify-between gap-6 overflow-hidden relative group">
						<div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-transparent opacity-40 pointer-events-none" />
						<div className="flex items-start gap-4 relative z-10 max-w-xl">
							<div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20 shrink-0">
								<FolderPlus className="w-6 h-6 text-primary" />
							</div>
							<div className="space-y-2">
								<h3 className="text-lg font-bold font-serif text-foreground">
									Your personal library is empty
								</h3>
								<p className="text-sm text-muted-foreground leading-relaxed">
									You haven't compiled or published any custom domain skills yet. Submit a product documentation URL above to compile one instantly into EVE format.
								</p>
							</div>
						</div>
						<div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto relative z-10 shrink-0">
							<Button
								onClick={() => navigate({ to: "/submit" })}
								size="sm"
								className="text-xs font-semibold h-9 bg-primary hover:bg-primary/95 text-primary-foreground"
							>
								Compose Custom Skill
							</Button>
						</div>
					</div>
				)}
			</div>

			{/* Community Library Section */}
			<div className="space-y-6 pt-10 border-t border-border/40">
				<div className="flex items-center justify-between">
					<div className="space-y-1">
						<h2 className="text-2xl font-bold font-serif text-foreground tracking-tight flex items-center gap-2">
							<Users className="h-5 w-5 text-primary" /> Domain Skill Catalog
						</h2>
						<p className="text-sm text-muted-foreground font-medium">
							Explore specialized EVE domain skills generated from documentation URLs (Expo, Stripe, Next.js, Google ADK).
						</p>
					</div>
					{communitySkills.length > 0 && (
						<span className="text-xs bg-muted text-muted-foreground border border-border px-2.5 py-1 rounded-full font-bold">
							{communitySkills.length} Shared
						</span>
					)}
				</div>

				{communitySkills.length > 0 ? (
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
						{communitySkills.map((skill) => (
							<SkillCard
								key={skill.id}
								id={skill.id}
								title={skill.title}
								description={skill.description}
								content={skill.content}
								authorName={
									skill.authorId === "guest_user"
										? "Guest"
										: skill.authorId?.slice(0, 8) || "Contributor"
								}
								tags={skill.tags}
								upvotes={skill.upvotes}
							/>
						))}
					</div>
				) : (
					<div className="bg-card border border-border/85 rounded-2xl p-8 shadow-sm flex flex-col md:flex-row items-center justify-between gap-6 overflow-hidden relative group">
						<div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-transparent opacity-40 pointer-events-none" />
						<div className="flex items-start gap-4 relative z-10 max-w-xl">
							<div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20 shrink-0">
								<Compass className="w-6 h-6 text-primary" />
							</div>
							<div className="space-y-2">
								<h3 className="text-lg font-bold font-serif text-foreground">
									Community catalog is empty
								</h3>
								<p className="text-sm text-muted-foreground leading-relaxed">
									No community domain skills have been published yet. Be the first to share a validated agent skill by compiling a URL above!
								</p>
							</div>
						</div>
						<div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto relative z-10 shrink-0">
							<Button
								onClick={() => navigate({ to: "/submit" })}
								size="sm"
								className="text-xs font-semibold h-9 bg-primary hover:bg-primary/95 text-primary-foreground"
							>
								Publish First Skill
							</Button>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
