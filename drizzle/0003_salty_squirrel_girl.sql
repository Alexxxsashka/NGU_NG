ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_actor_id_app_user_id_fk";
--> statement-breakpoint
ALTER TABLE "import_batches" DROP CONSTRAINT "import_batches_actor_id_app_user_id_fk";
--> statement-breakpoint
ALTER TABLE "reporting_periods" DROP CONSTRAINT "reporting_periods_updated_by_app_user_id_fk";
--> statement-breakpoint
ALTER TABLE "personnel" DROP CONSTRAINT "personnel_user_id_app_user_id_fk";
--> statement-breakpoint
ALTER TABLE "profile_claims" DROP CONSTRAINT "profile_claims_user_id_app_user_id_fk";
--> statement-breakpoint
ALTER TABLE "profile_claims" DROP CONSTRAINT "profile_claims_reviewed_by_app_user_id_fk";
--> statement-breakpoint
ALTER TABLE "recovery_tokens" DROP CONSTRAINT "recovery_tokens_user_id_app_user_id_fk";
--> statement-breakpoint
ALTER TABLE "report_items" DROP CONSTRAINT "report_items_reviewed_by_app_user_id_fk";
--> statement-breakpoint
ALTER TABLE "reports" DROP CONSTRAINT "reports_author_id_app_user_id_fk";
--> statement-breakpoint
ALTER TABLE "import_batches" ALTER COLUMN "actor_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "must_change_password" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_app_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_actor_id_app_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reporting_periods" ADD CONSTRAINT "reporting_periods_updated_by_app_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personnel" ADD CONSTRAINT "personnel_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_claims" ADD CONSTRAINT "profile_claims_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_claims" ADD CONSTRAINT "profile_claims_reviewed_by_app_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recovery_tokens" ADD CONSTRAINT "recovery_tokens_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_items" ADD CONSTRAINT "report_items_reviewed_by_app_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_author_id_app_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;