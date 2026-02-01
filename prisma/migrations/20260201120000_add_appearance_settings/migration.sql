-- Add appearance settings (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Settings' AND column_name = 'defaultTheme') THEN
        ALTER TABLE "Settings" ADD COLUMN "defaultTheme" TEXT NOT NULL DEFAULT 'auto';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Settings' AND column_name = 'accentColor') THEN
        ALTER TABLE "Settings" ADD COLUMN "accentColor" TEXT NOT NULL DEFAULT 'blue';
    END IF;
END $$;
