CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_address" varchar(42) NOT NULL,
	"event_type" varchar(50) NOT NULL,
	"call_id" integer NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"read_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "quote_stance" (
	"id" serial PRIMARY KEY NOT NULL,
	"call_id" integer NOT NULL,
	"quote_call_id" integer NOT NULL,
	"stance" varchar(10) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "notifications_user_read_idx" ON "notifications" USING btree ("user_address","read_at");--> statement-breakpoint
CREATE INDEX "notifications_user_time_idx" ON "notifications" USING btree ("user_address","created_at");--> statement-breakpoint
CREATE INDEX "quote_stance_quote_idx" ON "quote_stance" USING btree ("quote_call_id");