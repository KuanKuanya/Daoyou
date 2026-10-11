CREATE TABLE "wanjiedaoyou_admin_feedback_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"feedback_id" uuid NOT NULL,
	"assignee_id" uuid,
	"priority" varchar(16) DEFAULT 'normal' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"resolution_reason" text,
	"last_result" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_by" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "admin_feedback_cases_revision_positive_ck" CHECK ("wanjiedaoyou_admin_feedback_cases"."revision" >= 1)
);
--> statement-breakpoint
CREATE TABLE "wanjiedaoyou_admin_feedback_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"feedback_id" uuid NOT NULL,
	"kind" varchar(20) NOT NULL,
	"actor_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wanjiedaoyou_admin_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_key" varchar(160) NOT NULL,
	"actor_id" uuid NOT NULL,
	"action" varchar(64) NOT NULL,
	"target" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"expected_revision" integer,
	"status" varchar(24) DEFAULT 'pending' NOT NULL,
	"reason" text,
	"result" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "admin_operations_expected_revision_nonnegative_ck" CHECK ("wanjiedaoyou_admin_operations"."expected_revision" IS NULL OR "wanjiedaoyou_admin_operations"."expected_revision" >= 0)
);
--> statement-breakpoint
ALTER TABLE "wanjiedaoyou_admin_feedback_cases" ADD CONSTRAINT "wanjiedaoyou_admin_feedback_cases_feedback_id_wanjiedaoyou_feedbacks_id_fk" FOREIGN KEY ("feedback_id") REFERENCES "public"."wanjiedaoyou_feedbacks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wanjiedaoyou_admin_feedback_notes" ADD CONSTRAINT "wanjiedaoyou_admin_feedback_notes_feedback_id_wanjiedaoyou_feedbacks_id_fk" FOREIGN KEY ("feedback_id") REFERENCES "public"."wanjiedaoyou_feedbacks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "admin_feedback_cases_feedback_uidx" ON "wanjiedaoyou_admin_feedback_cases" USING btree ("feedback_id");--> statement-breakpoint
CREATE INDEX "admin_feedback_cases_assignee_priority_idx" ON "wanjiedaoyou_admin_feedback_cases" USING btree ("assignee_id","priority","updated_at");--> statement-breakpoint
CREATE INDEX "admin_feedback_cases_updated_idx" ON "wanjiedaoyou_admin_feedback_cases" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "admin_feedback_notes_feedback_created_idx" ON "wanjiedaoyou_admin_feedback_notes" USING btree ("feedback_id","created_at","id");--> statement-breakpoint
CREATE INDEX "admin_feedback_notes_feedback_kind_created_idx" ON "wanjiedaoyou_admin_feedback_notes" USING btree ("feedback_id","kind","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_operations_request_key_uidx" ON "wanjiedaoyou_admin_operations" USING btree ("request_key");--> statement-breakpoint
CREATE INDEX "admin_operations_actor_created_idx" ON "wanjiedaoyou_admin_operations" USING btree ("actor_id","created_at");--> statement-breakpoint
CREATE INDEX "admin_operations_status_updated_idx" ON "wanjiedaoyou_admin_operations" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "admin_operations_action_created_idx" ON "wanjiedaoyou_admin_operations" USING btree ("action","created_at");--> statement-breakpoint
CREATE INDEX "admin_operations_target_gin_idx" ON "wanjiedaoyou_admin_operations" USING gin ("target");