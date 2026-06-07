CREATE TABLE "call_statement" (
	"call_id" integer PRIMARY KEY NOT NULL,
	"statement" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
