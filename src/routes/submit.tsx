import { zodResolver } from "@hookform/resolvers/zod";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { SignedOut, SignInButton } from "../components/auth/ClerkHelpers";
import { Button } from "../components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { createSkill } from "../server/skills";

export const Route = createFileRoute("/submit")({
	head: () => ({
		meta: [
			{ title: "Submit a Skill - Raven" },
			{
				name: "description",
				content: "Share your agent skills with the community.",
			},
		],
	}),
	component: SubmitPage,
});

const manualFormSchema = z.object({
	title: z.string().min(3, "Title must be at least 3 characters"),
	description: z.string().min(10, "Description must be at least 10 characters"),
	content: z.string().min(20, "Prompt content must be at least 20 characters"),
	tagsString: z.string().min(1, "Add at least one tag"),
});

type ManualFormValues = z.infer<typeof manualFormSchema>;

function SubmitPage() {
	const navigate = useNavigate();
	const submitFn = useServerFn(createSkill);
	const [serverError, setServerError] = useState<string | null>(null);
	const [mcpScript, setMcpScript] = useState<string | null>(null);
	const [mcpConfig, setMcpConfig] = useState<string | null>(null);
	const [traceUrl, setTraceUrl] = useState<string | null>(null);
	const [sourceUrl, setSourceUrl] = useState<string | null>(null);

	const manualForm = useForm<ManualFormValues>({
		resolver: zodResolver(manualFormSchema),
		defaultValues: {
			title: "",
			description: "",
			content: "",
			tagsString: "",
		},
	});

	// biome-ignore lint/correctness/useExhaustiveDependencies: Run once on mount to check pending skill
	useEffect(() => {
		try {
			const pending = localStorage.getItem("pendingGeneratedSkill");
			if (pending) {
				const parsed = JSON.parse(pending);
				manualForm.reset({
					title: parsed.title || "",
					description: parsed.description || "",
					content: parsed.content || "",
					tagsString: Array.isArray(parsed.tags) ? parsed.tags.join(", ") : "",
				});
				setMcpScript(parsed.mcpScript || null);
				setMcpConfig(parsed.mcpConfig || null);
				setTraceUrl(parsed.traceUrl || null);
				setSourceUrl(parsed.sourceUrl || null);
				localStorage.removeItem("pendingGeneratedSkill");
			}
		} catch (e) {
			console.error("Failed to parse pending generated skill:", e);
		}
	}, []);

	const onManualSubmit = async (data: ManualFormValues) => {
		setServerError(null);
		const tags = data.tagsString
			.split(",")
			.map((t) => t.trim())
			.filter(Boolean);

		if (tags.length === 0 || tags.length > 5) {
			setServerError(
				"Please provide between 1 and 5 tags separated by commas.",
			);
			return;
		}

		try {
			const result = await submitFn({
				data: {
					title: data.title,
					description: data.description,
					content: data.content,
					tags,
					mcpScript,
					mcpConfig,
					traceUrl,
					sourceUrl,
				},
			});

			if (result.success) {
				navigate({ to: "/" });
			}
		} catch (error: unknown) {
			setServerError(
				error instanceof Error
					? error.message
					: "Failed to submit skill. Please try again.",
			);
		}
	};

	return (
		<div className="container max-w-3xl mx-auto py-12 lg:py-24 animate-in fade-in slide-in-from-bottom-4 duration-500">
			<div className="flex flex-col items-center text-center space-y-4 mb-10">
				<div className="inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
					<Sparkles className="mr-2 h-4 w-4" />
					Share Your Expertise
				</div>
				<h1 className="text-4xl font-bold tracking-tight sm:text-5xl text-foreground">
					Submit a <span className="text-primary">Skill</span>
				</h1>
				<p className="text-muted-foreground text-lg max-w-[600px]">
					Contribute to the community by sharing your best prompts, workflows,
					and agent instructions.
				</p>
			</div>

			<SignedOut>
				<div className="mb-8 p-5 rounded-2xl border border-amber-200/50 bg-amber-50/5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
					<div className="space-y-1">
						<h4 className="text-sm font-bold text-amber-800 dark:text-amber-300 flex items-center gap-2">
							Guest Session Active
						</h4>
						<p className="text-xs text-amber-700/80 dark:text-amber-400/80 leading-relaxed">
							You are playing in guest mode. Your skills will publish instantly!
							Sign in to persist your skills to a personalized developer
							profile.
						</p>
					</div>
					<SignInButton mode="modal">
						<Button
							size="sm"
							variant="outline"
							className="border-amber-300 text-amber-800 hover:bg-amber-100 dark:text-amber-300 shrink-0 font-semibold rounded-full px-5"
						>
							Sign In to Sync
						</Button>
					</SignInButton>
				</div>
			</SignedOut>

			<Card className="border-border shadow-lg bg-card">
				<CardHeader>
					<CardTitle>Manual Entry</CardTitle>
					<CardDescription>
						Write your skill instructions manually to share with the community.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form
						onSubmit={manualForm.handleSubmit(onManualSubmit)}
						className="space-y-6"
					>
						<div className="space-y-2">
							<Label htmlFor="title">Skill Title</Label>
							<Input
								id="title"
								placeholder="e.g., Next.js 15 Expert Assistant"
								{...manualForm.register("title")}
								className="bg-background border-border"
							/>
							{manualForm.formState.errors.title && (
								<p className="text-sm text-destructive">
									{manualForm.formState.errors.title.message}
								</p>
							)}
						</div>

						<div className="space-y-2">
							<Label htmlFor="description">Short Description</Label>
							<Textarea
								id="description"
								placeholder="Briefly describe what this skill accomplishes..."
								{...manualForm.register("description")}
								className="resize-none bg-background border-border"
								rows={2}
							/>
							{manualForm.formState.errors.description && (
								<p className="text-sm text-destructive">
									{manualForm.formState.errors.description.message}
								</p>
							)}
						</div>

						<div className="space-y-2">
							<Label htmlFor="content">Prompt Content / Instructions</Label>
							<Textarea
								id="content"
								placeholder="Paste the full prompt, context, or instructions here..."
								{...manualForm.register("content")}
								className="min-h-[200px] font-mono text-sm bg-background border-border"
							/>
							{manualForm.formState.errors.content && (
								<p className="text-sm text-destructive">
									{manualForm.formState.errors.content.message}
								</p>
							)}
						</div>

						<div className="space-y-2">
							<Label htmlFor="tagsString">Tags (Comma separated)</Label>
							<Input
								id="tagsString"
								placeholder="react, tailwind, ui"
								{...manualForm.register("tagsString")}
								className="bg-background border-border"
							/>
							<p className="text-xs text-muted-foreground">Add up to 5 tags.</p>
							{manualForm.formState.errors.tagsString && (
								<p className="text-sm text-destructive">
									{manualForm.formState.errors.tagsString.message}
								</p>
							)}
						</div>

						{serverError && (
							<div className="p-3 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-sm font-medium">
								{serverError}
							</div>
						)}

						<Button
							type="submit"
							className="w-full shadow-sm"
							disabled={manualForm.formState.isSubmitting}
						>
							{manualForm.formState.isSubmitting ? (
								<>
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									Publishing...
								</>
							) : (
								"Publish Skill"
							)}
						</Button>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
