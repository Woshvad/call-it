CREATE TABLE "posted_receipts" (
	"call_id" integer PRIMARY KEY NOT NULL,
	"posted_at" timestamp DEFAULT now() NOT NULL
);
