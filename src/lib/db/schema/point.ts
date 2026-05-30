import {
  boolean,
  date,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { userRoleEnum } from "./auth";
import { employees } from "./employee";
import { divisions } from "./master";

export const pointCatalogVersionStatusEnum = pgEnum("point_catalog_version_status", [
  "DRAFT",
  "ACTIVE",
  "ARCHIVED",
]);

export const activityStatusEnum = pgEnum("activity_status", [
  "DRAFT",
  "DIAJUKAN",
  "DITOLAK_SPV",
  "REVISI_TW",
  "DIAJUKAN_ULANG",
  "DISETUJUI_SPV",
  "OVERRIDE_HRD",
  "DIKUNCI_PAYROLL",
]);

export const pointApprovalActionEnum = pgEnum("point_approval_action", [
  "SUBMIT",
  "APPROVE_SPV",
  "REJECT_SPV",
  "RESUBMIT",
  "OVERRIDE_HRD",
  "LOCK_PAYROLL",
  "RETURN_TO_REVISION",
]);

export const monthlyPointPerformanceStatusEnum = pgEnum("monthly_point_performance_status", [
  "DRAFT",
  "FINALIZED",
  "LOCKED",
]);

export const monthlyPointPerformanceInputSourceEnum = pgEnum("monthly_point_performance_input_source", [
  "GENERATED",
  "MANUAL_INPUT",
]);

export const pointCatalogVersions = pgTable("point_catalog_versions", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: varchar("code", { length: 50 }).notNull().unique(),
  sourceFileName: varchar("source_file_name", { length: 255 }),
  notes: text("notes"),
  status: pointCatalogVersionStatusEnum("status").notNull().default("DRAFT"),
  effectiveStartDate: date("effective_start_date", { mode: "date" }).notNull(),
  effectiveEndDate: date("effective_end_date", { mode: "date" }),
  importedAt: timestamp("imported_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull().$onUpdateFn(() => new Date()),
});

export const divisionPointTargetRules = pgTable("division_point_target_rules", {
  id: uuid("id").defaultRandom().primaryKey(),
  versionId: uuid("version_id").notNull().references(() => pointCatalogVersions.id, { onDelete: "cascade" }),
  divisionCode: varchar("division_code", { length: 20 }),
  divisionName: varchar("division_name", { length: 100 }).notNull(),
  targetPoints: integer("target_points").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull().$onUpdateFn(() => new Date()),
});

export const pointCatalogEntries = pgTable("point_catalog_entries", {
  id: uuid("id").defaultRandom().primaryKey(),
  versionId: uuid("version_id").notNull().references(() => pointCatalogVersions.id, { onDelete: "cascade" }),
  divisionCode: varchar("division_code", { length: 20 }),
  divisionName: varchar("division_name", { length: 100 }).notNull(),
  externalRowNumber: integer("external_row_number"),
  externalCode: varchar("external_code", { length: 50 }),
  workName: text("work_name").notNull(),
  pointValue: numeric("point_value", { precision: 12, scale: 2 }).notNull(),
  unitDescription: text("unit_description"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull().$onUpdateFn(() => new Date()),
});

export const dailyActivityEntries = pgTable("daily_activity_entries", {
  id: uuid("id").defaultRandom().primaryKey(),
  employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  workDate: date("work_date", { mode: "date" }).notNull(),
  actualDivisionId: uuid("actual_division_id").references(() => divisions.id, { onDelete: "set null" }),
  pointCatalogEntryId: uuid("point_catalog_entry_id").notNull().references(() => pointCatalogEntries.id, { onDelete: "restrict" }),
  pointCatalogVersionId: uuid("point_catalog_version_id").notNull().references(() => pointCatalogVersions.id, { onDelete: "restrict" }),
  pointCatalogDivisionName: varchar("point_catalog_division_name", { length: 100 }).notNull(),
  jobIdSnapshot: varchar("job_id_snapshot", { length: 50 }),
  workNameSnapshot: text("work_name_snapshot").notNull(),
  unitDescriptionSnapshot: text("unit_description_snapshot"),
  pointValueSnapshot: numeric("point_value_snapshot", { precision: 12, scale: 2 }).notNull(),
  quantity: numeric("quantity", { precision: 12, scale: 2 }).notNull(),
  totalPoints: numeric("total_points", { precision: 14, scale: 2 }).notNull(),
  status: activityStatusEnum("status").notNull().default("DRAFT"),
  notes: text("notes"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  rejectedAt: timestamp("rejected_at", { withTimezone: true }),
  lockedAt: timestamp("locked_at", { withTimezone: true }),
  createdByUserId: uuid("created_by_user_id").notNull(),
  updatedByUserId: uuid("updated_by_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull().$onUpdateFn(() => new Date()),
});

export const dailyActivityApprovalLogs = pgTable("daily_activity_approval_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  activityEntryId: uuid("activity_entry_id").notNull().references(() => dailyActivityEntries.id, { onDelete: "cascade" }),
  action: pointApprovalActionEnum("action").notNull(),
  actorUserId: uuid("actor_user_id").notNull(),
  actorRole: userRoleEnum("actor_role").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const monthlyPointPerformances = pgTable("monthly_point_performances", {
  id: uuid("id").defaultRandom().primaryKey(),
  employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  periodStartDate: date("period_start_date", { mode: "date" }).notNull(),
  periodEndDate: date("period_end_date", { mode: "date" }).notNull(),
  divisionSnapshotId: uuid("division_snapshot_id").references(() => divisions.id, { onDelete: "set null" }),
  divisionSnapshotName: varchar("division_snapshot_name", { length: 100 }).notNull(),
  targetDailyPoints: integer("target_daily_points").notNull(),
  targetDays: integer("target_days").notNull(),
  totalTargetPoints: integer("total_target_points").notNull(),
  totalApprovedPoints: numeric("total_approved_points", { precision: 14, scale: 2 }).notNull(),
  performancePercent: numeric("performance_percent", { precision: 7, scale: 2 }).notNull(),
  inputSource: monthlyPointPerformanceInputSourceEnum("input_source").notNull().default("GENERATED"),
  status: monthlyPointPerformanceStatusEnum("status").notNull().default("DRAFT"),
  calculatedAt: timestamp("calculated_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull().$onUpdateFn(() => new Date()),
});

export type PointCatalogVersion = typeof pointCatalogVersions.$inferSelect;
export type NewPointCatalogVersion = typeof pointCatalogVersions.$inferInsert;
export type DivisionPointTargetRule = typeof divisionPointTargetRules.$inferSelect;
export type NewDivisionPointTargetRule = typeof divisionPointTargetRules.$inferInsert;
export type PointCatalogEntry = typeof pointCatalogEntries.$inferSelect;
export type NewPointCatalogEntry = typeof pointCatalogEntries.$inferInsert;
export type DailyActivityEntry = typeof dailyActivityEntries.$inferSelect;
export type NewDailyActivityEntry = typeof dailyActivityEntries.$inferInsert;
export type DailyActivityApprovalLog = typeof dailyActivityApprovalLogs.$inferSelect;
export type NewDailyActivityApprovalLog = typeof dailyActivityApprovalLogs.$inferInsert;
export type MonthlyPointPerformance = typeof monthlyPointPerformances.$inferSelect;
export type NewMonthlyPointPerformance = typeof monthlyPointPerformances.$inferInsert;
