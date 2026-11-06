CREATE TYPE "public"."attachment_kind" AS ENUM('image', 'file');--> statement-breakpoint
CREATE TYPE "public"."doc_event_kind" AS ENUM('type', 'paste', 'delete', 'format', 'undo', 'import', 'other');--> statement-breakpoint
CREATE TYPE "public"."invite_status" AS ENUM('pending', 'active');--> statement-breakpoint
CREATE TYPE "public"."share_role" AS ENUM('viewer', 'commenter', 'editor');--> statement-breakpoint
CREATE TYPE "public"."submission_status" AS ENUM('not_started', 'in_progress', 'submitted');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('teacher', 'student');--> statement-breakpoint
CREATE TABLE "assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_id" uuid NOT NULL,
	"teacher_id" uuid NOT NULL,
	"title" text NOT NULL,
	"instructions" jsonb NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"template_doc_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"uploader_id" uuid NOT NULL,
	"kind" "attachment_kind" NOT NULL,
	"filename" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"data" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "class_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_id" uuid NOT NULL,
	"user_id" uuid,
	"email" text NOT NULL,
	"status" "invite_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "classes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"teacher_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"parent_id" uuid,
	"anchor_id" text NOT NULL,
	"body" text NOT NULL,
	"resolved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "doc_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "doc_event_kind" NOT NULL,
	"steps" jsonb NOT NULL,
	"inserted" integer DEFAULT 0 NOT NULL,
	"deleted" integer DEFAULT 0 NOT NULL,
	"checkpoint" jsonb,
	"client_t" integer NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"email" text NOT NULL,
	"user_id" uuid,
	"role" "share_role" NOT NULL,
	"status" "invite_status" DEFAULT 'pending' NOT NULL,
	"invited_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"title" text NOT NULL,
	"content" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"labels" text[] DEFAULT '{}'::text[] NOT NULL,
	"assignment_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"status" "submission_status" DEFAULT 'not_started' NOT NULL,
	"first_submitted_at" timestamp with time zone,
	"submitted_at" timestamp with time zone,
	"is_late" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" "user_role" NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploader_id_users_id_fk" FOREIGN KEY ("uploader_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_members" ADD CONSTRAINT "class_members_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_members" ADD CONSTRAINT "class_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_parent_id_comments_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_events" ADD CONSTRAINT "doc_events_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_events" ADD CONSTRAINT "doc_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_shares" ADD CONSTRAINT "document_shares_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_shares" ADD CONSTRAINT "document_shares_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_shares" ADD CONSTRAINT "document_shares_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attachments_document_idx" ON "attachments" USING btree ("document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "class_members_class_email_unique" ON "class_members" USING btree ("class_id","email");--> statement-breakpoint
CREATE INDEX "class_members_email_idx" ON "class_members" USING btree ("email");--> statement-breakpoint
CREATE INDEX "comments_document_idx" ON "comments" USING btree ("document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "doc_events_doc_seq_unique" ON "doc_events" USING btree ("document_id","seq");--> statement-breakpoint
CREATE INDEX "doc_events_document_idx" ON "doc_events" USING btree ("document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "document_shares_doc_email_unique" ON "document_shares" USING btree ("document_id","email");--> statement-breakpoint
CREATE INDEX "document_shares_email_idx" ON "document_shares" USING btree ("email");--> statement-breakpoint
CREATE INDEX "document_shares_user_idx" ON "document_shares" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "documents_owner_idx" ON "documents" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "documents_assignment_idx" ON "documents" USING btree ("assignment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "submissions_assignment_student_unique" ON "submissions" USING btree ("assignment_id","student_id");