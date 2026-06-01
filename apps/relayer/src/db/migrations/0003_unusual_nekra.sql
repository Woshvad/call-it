CREATE TABLE "duel_kings" (
	"id" serial PRIMARY KEY NOT NULL,
	"winner_address" varchar(42) NOT NULL,
	"win_streak" integer DEFAULT 0 NOT NULL,
	"highest_pot_usdc" varchar(30) DEFAULT '0' NOT NULL,
	"last_win_at" timestamp,
	"week_anchor" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trending_duels" (
	"id" serial PRIMARY KEY NOT NULL,
	"challenge_id" integer NOT NULL,
	"trending_until" timestamp NOT NULL,
	"pot_usdc" varchar(30) DEFAULT '0' NOT NULL,
	"backer_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "duel_kings_week_anchor_idx" ON "duel_kings" USING btree ("week_anchor");--> statement-breakpoint
CREATE UNIQUE INDEX "trending_duels_challenge_id_idx" ON "trending_duels" USING btree ("challenge_id");--> statement-breakpoint
CREATE INDEX "trending_duels_trending_until_idx" ON "trending_duels" USING btree ("trending_until");