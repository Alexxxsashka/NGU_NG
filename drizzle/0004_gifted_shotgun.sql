CREATE TABLE "positions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" integer NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "positions_number_unique" UNIQUE("number")
);
--> statement-breakpoint
ALTER TABLE "personnel" DROP CONSTRAINT "personnel_rank_ranks_id_fk";
--> statement-breakpoint
ALTER TABLE "personnel" ADD COLUMN "position_id" uuid;--> statement-breakpoint
ALTER TABLE "units" ADD COLUMN "number" integer;--> statement-breakpoint
ALTER TABLE "personnel" ADD CONSTRAINT "personnel_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personnel" ADD CONSTRAINT "personnel_rank_ranks_id_fk" FOREIGN KEY ("rank") REFERENCES "public"."ranks"("id") ON DELETE no action ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_number_unique" UNIQUE("number");