import { createFileRoute } from "@tanstack/react-router";
import { Search } from "lucide-react";
import SkillCard from "../components/skills/SkillCard";
import { Input } from "../components/ui/input";
import { getSkills } from "../server/skills";

// Validate search params for filtering
export const Route = createFileRoute("/explore")({
	head: () => ({
		meta: [
			{ title: "Explore Skills - Skill Maker" },
			{
				name: "description",
				content:
					"Discover the best prompts and agent workflows from the community.",
			},
		],
	}),
	validateSearch: (search: Record<string, unknown>) => {
		return {
			q: (search.q as string) || "",
			tag: (search.tag as string) || "",
		};
	},
	loaderDeps: ({ search: { q, tag } }) => ({ q, tag }),
	loader: async ({ deps: { q, tag } }) => {
		try {
			const skills = await getSkills({ data: { search: q, tag } });
			return {
				skills: skills || [],
			};
		} catch (e) {
			console.error("Explore loader error:", e);
			return {
				skills: [],
			};
		}
	},
	component: ExplorePage,
});

function ExplorePage() {
	const { skills } = Route.useLoaderData();
	const { q, tag } = Route.useSearch();
	const navigate = Route.useNavigate();

	const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		const formData = new FormData(e.currentTarget);
		const query = formData.get("q") as string;

		navigate({
			search: (prev) => ({
				...prev,
				q: query || undefined,
			}),
		});
	};

	return (
		<div className="relative isolate min-h-screen bg-background">
			<div className="container py-12 animate-in fade-in duration-500 relative z-10">
				<div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-12 border-b border-border/50 pb-6">
					<div>
						<h1 className="text-4xl font-bold font-serif text-foreground tracking-tight">
							Explore Skills
						</h1>
						<p className="text-muted-foreground mt-2 text-lg font-medium">
							Discover the best prompts and agent workflows from the community.
						</p>
					</div>

					<form
						onSubmit={handleSearch}
						className="relative w-full md:w-auto md:min-w-[350px]"
					>
						<Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
						<Input
							name="q"
							defaultValue={q}
							placeholder="Search skills by name or keyword..."
							className="pl-12 h-12 rounded-full bg-card backdrop-blur-md border border-border focus-visible:ring-primary focus-visible:border-primary shadow-sm text-md"
						/>
					</form>
				</div>

				{tag && (
					<div className="mb-8 flex items-center gap-3 bg-card backdrop-blur-md border border-border p-4 rounded-xl inline-flex shadow-sm">
						<span className="text-sm text-muted-foreground font-medium">
							Filtering by tag:
						</span>
						<span className="inline-flex items-center rounded-md bg-primary/10 px-3 py-1 text-sm font-bold text-primary border border-primary/20">
							{tag}
						</span>
						<button
							type="button"
							onClick={() =>
								navigate({ search: (prev) => ({ ...prev, tag: undefined }) })
							}
							className="text-sm text-muted-foreground hover:text-foreground transition-colors ml-2 font-medium"
						>
							&times; Clear filter
						</button>
					</div>
				)}

				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
					{skills.map((skill) => (
						<SkillCard
							key={skill.id}
							id={skill.id}
							title={skill.title}
							description={skill.description}
							content={skill.content}
							tags={skill.tags}
							upvotes={skill.upvotes}
							authorName={skill.authorId} // Would normally join with User table
						/>
					))}
					{skills.length === 0 && (
						<div className="col-span-full py-24 text-center">
							<div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-secondary/50 mb-4">
								<Search className="h-8 w-8 text-muted-foreground" />
							</div>
							<h3 className="text-xl font-bold text-foreground">
								No skills found
							</h3>
							<p className="text-muted-foreground mt-2">
								Try adjusting your search or filtering by a different tag.
							</p>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
