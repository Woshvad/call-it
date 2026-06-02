CREATE TABLE "call_oracle_criteria" (
	"call_id" integer PRIMARY KEY NOT NULL,
	"oracle_type" integer NOT NULL,
	"identifier" text NOT NULL,
	"target_unit" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
