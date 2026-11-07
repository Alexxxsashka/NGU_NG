CREATE INDEX "audit_created" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "evidence_item" ON "evidence_links" USING btree ("item_id");