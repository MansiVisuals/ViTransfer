-- Add language preference to client contacts
-- NULL = use system default language
ALTER TABLE "ClientContact" ADD COLUMN "language" TEXT;
