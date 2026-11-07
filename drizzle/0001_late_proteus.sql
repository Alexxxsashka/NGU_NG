CREATE UNIQUE INDEX "task_scope_name" ON "tasks" USING btree (coalesce("unit_id", '00000000-0000-0000-0000-000000000000'::uuid),"normalized_name");--> statement-breakpoint
ALTER TABLE "ranks" ADD CONSTRAINT "rank_positive" CHECK ("ranks"."id">0);--> statement-breakpoint
ALTER TABLE "ranks" ADD CONSTRAINT "rank_multiplier_positive" CHECK ("ranks"."multiplier">=0);--> statement-breakpoint
ALTER TABLE "report_items" ADD CONSTRAINT "item_quantity_positive" CHECK ("report_items"."quantity">0);--> statement-breakpoint
ALTER TABLE "report_items" ADD CONSTRAINT "item_points_positive" CHECK ("report_items"."points">=0 AND "report_items"."points_rate">=0);--> statement-breakpoint
ALTER TABLE "report_items" ADD CONSTRAINT "item_money_positive" CHECK ("report_items"."reward_rate">=0 AND "report_items"."rank_multiplier">=0 AND "report_items"."estimated_amount">=0 AND "report_items"."approved_amount">=0);--> statement-breakpoint
ALTER TABLE "report_items" ADD CONSTRAINT "item_status" CHECK ("report_items"."status" IN ('pending','approved','rejected','clarification'));--> statement-breakpoint
ALTER TABLE "report_items" ADD CONSTRAINT "item_time_category" CHECK ("report_items"."time_category" IN ('any','day','night','prime'));--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "report_static_digits" CHECK ("reports"."static_id" ~ '^[0-9]{1,30}$');--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "report_monday" CHECK (extract(isodow from "reports"."week_start")=1);--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "task_points_positive" CHECK ("tasks"."points">=0);--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "task_reward_positive" CHECK ("tasks"."reward">=0);--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "task_time_category" CHECK ("tasks"."time_category" IN ('any','day','night','prime'));--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "task_version_positive" CHECK ("tasks"."version">0);--> statement-breakpoint
ALTER TABLE "app_user" ADD CONSTRAINT "user_role" CHECK ("app_user"."role" IN ('admin','member'));--> statement-breakpoint
ALTER TABLE "weekly_awards" ADD CONSTRAINT "award_cap_positive" CHECK ("weekly_awards"."cap">=0);