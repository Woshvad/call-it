CREATE TABLE "address_book" (
	"id" serial PRIMARY KEY NOT NULL,
	"privy_user_id" varchar(128) NOT NULL,
	"address" varchar(42) NOT NULL,
	"label" text,
	"added_at" timestamp DEFAULT now() NOT NULL,
	"removed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "auth_methods" (
	"id" serial PRIMARY KEY NOT NULL,
	"privy_user_id" varchar(128) NOT NULL,
	"auth_type" varchar(32) NOT NULL,
	"linked_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "onboarding_state" (
	"privy_user_id" varchar(128) PRIMARY KEY NOT NULL,
	"current_step" integer DEFAULT 1 NOT NULL,
	"handle_set_at" timestamp,
	"socials_step_completed_at" timestamp,
	"followgraph_optin_at" timestamp,
	"tagline_committed_at" timestamp
);
--> statement-breakpoint
CREATE INDEX "address_book_user_idx" ON "address_book" USING btree ("privy_user_id");--> statement-breakpoint
CREATE INDEX "auth_methods_user_idx" ON "auth_methods" USING btree ("privy_user_id","linked_at");