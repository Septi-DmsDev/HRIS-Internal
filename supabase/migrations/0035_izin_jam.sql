ALTER TYPE "public"."ticket_type" ADD VALUE IF NOT EXISTS 'IZIN_JAM';

ALTER TABLE "attendance_tickets"
  ADD COLUMN IF NOT EXISTS "izin_hours" integer;
