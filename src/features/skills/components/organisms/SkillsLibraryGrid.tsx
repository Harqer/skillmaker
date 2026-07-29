import { useNavigate } from "@tanstack/react-router";
import { BookOpen, Compass, FolderPlus, Users } from "lucide-react";
import { SignedIn } from "@/components/auth/ClerkHelpers";
import SkillCard from "@/components/skills/SkillCard";
import { Button } from "@/components/ui/button";
import type { Skill } from "@/features/skills/types";

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
		<div className="space-y-16">
			{/* Personal Library Section (My Library) */}
			<div className="space-y-6 pt-6 border-t border-border/40">
				<div className="flex items-center justify-between">
					<div className="space-y-1">
						<h2 className="text-2xl font-bold font-serif text-foreground tracking-tight flex items-center gap-2">
							<BookOpen className="h-5 w-5 text-primary" /> My Library
						</h2>
						<p className="text-sm text-muted-foreground font-medium">
							Your personal workspace, including compiled prompt skills and
							custom setups.
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
									skill.authorId === "user_mock" ? "You (Guest)" : "You"
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
									You haven't compiled or published any custom prompt skills
									yet. Submit a product documentation URL above to compile one
									instantly, or design a custom skill from scratch.
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
							<Users className="h-5 w-5 text-primary" /> Community Library
						</h2>
						<p className="text-sm text-muted-foreground font-medium">
							Explore specialized agent prompt skills published by engineers
							globally.
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
									skill.authorId === "user_mock"
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
									No community-shared prompt skills have been published yet. Be
									the first to share a validated agent skill, or load one of the
									quick-start blueprints below to begin.
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
