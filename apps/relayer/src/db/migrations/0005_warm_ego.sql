CREATE TABLE "follow_graph" (
	"id" serial PRIMARY KEY NOT NULL,
	"privy_user_id" varchar(128) NOT NULL,
	"platform" varchar(16) NOT NULL,
	"followed_handle" varchar(64),
	"followed_id" varchar(64),
	"fetched_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_link_index" (
	"id" serial PRIMARY KEY NOT NULL,
	"platform" varchar(16) NOT NULL,
	"handle_normalized" varchar(64) NOT NULL,
	"user_address" varchar(42) NOT NULL,
	"linked_at" timestamp DEFAULT now() NOT NULL,
	"unlinked_at" timestamp
);
--> statement-breakpoint
CREATE INDEX "follow_graph_user_idx" ON "follow_graph" USING btree ("privy_user_id","platform");--> statement-breakpoint
CREATE UNIQUE INDEX "social_link_active_idx" ON "social_link_index" USING btree ("platform","handle_normalized");--> statement-breakpoint
CREATE INDEX "social_link_user_idx" ON "social_link_index" USING btree ("user_address");