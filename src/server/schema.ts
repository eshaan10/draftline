import { sql } from "drizzle-orm";
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  integer,
  jsonb,
  boolean,
  uniqueIndex,
  index,
  customType,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

export const bytea = customType<{ data: Buffer; notNull: false; default: false }>({
  dataType() {
    return "bytea";
  },
});

export const userRole = pgEnum("user_role", ["teacher", "student"]);
export const shareRole = pgEnum("share_role", ["viewer", "commenter", "editor"]);
export const inviteStatus = pgEnum("invite_status", ["pending", "active"]);
export const attachmentKind = pgEnum("attachment_kind", ["image", "file"]);
export const docEventKind = pgEnum("doc_event_kind", [
  "type",
  "paste",
  "delete",
  "format",
  "undo",
  "import",
  "other",
]);
export const submissionStatus = pgEnum("submission_status", [
  "not_started",
  "in_progress",
  "submitted",
]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  role: userRole("role").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    content: jsonb("content").notNull(),
    version: integer("version").notNull().default(1),
    labels: text("labels")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    assignmentId: uuid("assignment_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    ownerIdx: index("documents_owner_idx").on(t.ownerId),
    assignmentIdx: index("documents_assignment_idx").on(t.assignmentId),
  }),
);

export const documentShares = pgTable(
  "document_shares",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    role: shareRole("role").notNull(),
    status: inviteStatus("status").notNull().default("pending"),
    invitedBy: uuid("invited_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqDocEmail: uniqueIndex("document_shares_doc_email_unique").on(t.documentId, t.email),
    emailIdx: index("document_shares_email_idx").on(t.email),
    userIdx: index("document_shares_user_idx").on(t.userId),
  }),
);

export const attachments = pgTable(
  "attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    uploaderId: uuid("uploader_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: attachmentKind("kind").notNull(),
    filename: text("filename").notNull(),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    data: bytea("data").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    documentIdx: index("attachments_document_idx").on(t.documentId),
  }),
);

export const docEvents = pgTable(
  "doc_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: docEventKind("kind").notNull(),
    steps: jsonb("steps").notNull(),
    inserted: integer("inserted").notNull().default(0),
    deleted: integer("deleted").notNull().default(0),
    checkpoint: jsonb("checkpoint"),
    clientT: integer("client_t").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqDocSeq: uniqueIndex("doc_events_doc_seq_unique").on(t.documentId, t.seq),
    documentIdx: index("doc_events_document_idx").on(t.documentId),
  }),
);

export const comments = pgTable(
  "comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id").references((): AnyPgColumn => comments.id, {
      onDelete: "cascade",
    }),
    anchorId: text("anchor_id").notNull(),
    body: text("body").notNull(),
    resolved: boolean("resolved").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    documentIdx: index("comments_document_idx").on(t.documentId),
  }),
);

export const classes = pgTable("classes", {
  id: uuid("id").primaryKey().defaultRandom(),
  teacherId: uuid("teacher_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const classMembers = pgTable(
  "class_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    email: text("email").notNull(),
    status: inviteStatus("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqClassEmail: uniqueIndex("class_members_class_email_unique").on(t.classId, t.email),
    emailIdx: index("class_members_email_idx").on(t.email),
  }),
);

export const assignments = pgTable("assignments", {
  id: uuid("id").primaryKey().defaultRandom(),
  classId: uuid("class_id")
    .notNull()
    .references(() => classes.id, { onDelete: "cascade" }),
  teacherId: uuid("teacher_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  instructions: jsonb("instructions").notNull(),
  dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
  templateDocId: uuid("template_doc_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const submissions = pgTable(
  "submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assignmentId: uuid("assignment_id")
      .notNull()
      .references(() => assignments.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    status: submissionStatus("status").notNull().default("not_started"),
    firstSubmittedAt: timestamp("first_submitted_at", { withTimezone: true }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    isLate: boolean("is_late").notNull().default(false),
  },
  (t) => ({
    uniqAssignStudent: uniqueIndex("submissions_assignment_student_unique").on(
      t.assignmentId,
      t.studentId,
    ),
  }),
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
