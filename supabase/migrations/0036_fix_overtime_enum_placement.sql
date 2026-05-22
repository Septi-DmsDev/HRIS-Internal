-- Migration 0036: fix overtime enum + kolom placement
-- Aman dijalankan berkali-kali (idempotent)

-- 1. Pastikan LEMBUR_FULLDAY ada di enum overtime_type
--    ALTER TYPE ... ADD VALUE tidak bisa pakai IF NOT EXISTS di semua PG versi,
--    gunakan DO block untuk safety.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'LEMBUR_FULLDAY'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'overtime_type')
  ) THEN
    ALTER TYPE overtime_type ADD VALUE 'LEMBUR_FULLDAY';
  END IF;
END $$;

-- 2. Pastikan enum overtime_placement ada
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'overtime_placement'
  ) THEN
    CREATE TYPE overtime_placement AS ENUM ('BEFORE_SHIFT', 'AFTER_SHIFT');
  END IF;
END $$;

-- 3. Pastikan kolom overtime_placement ada di overtime_requests
ALTER TABLE overtime_requests
  ADD COLUMN IF NOT EXISTS overtime_placement overtime_placement NOT NULL DEFAULT 'AFTER_SHIFT';
