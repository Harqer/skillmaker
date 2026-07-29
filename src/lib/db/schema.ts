import {
	integer,
	pgTable,
	text,
	timestamp,
	uuid,
	varchar,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
	id: varchar("id", { length: 255 }).primaryKey(),
	email: varchar("email", { length: 255 }).notNull(),
	firstName: varchar("first_name", { length: 255 }),
	lastName: varchar("last_name", { length: 255 }),
	createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const skills = pgTable("skills", {
	id: uuid("id").defaultRandom().primaryKey(),
	title: varchar("title", { length: 255 }).notNull(),
	description: text("description").notNull(),
	content: text("content").notNull(),
	tags: text("tags").array().notNull(),
	authorId: varchar("author_id", { length: 255 })
		.notNull()
		.references(() => users.id),
	upvotes: integer("upvotes").default(0).notNull(),
	mcpScript: text("mcp_script"),
	mcpConfig: text("mcp_config"),
	traceUrl: text("trace_url"),
	sourceUrl: text("source_url"),
	createdAt: timestamp("created_at").defaultNow().notNull(),
});
