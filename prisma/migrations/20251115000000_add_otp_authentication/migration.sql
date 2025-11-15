-- Add OTP authentication support to Project table
-- Default to PASSWORD mode to maintain backward compatibility
ALTER TABLE "Project" ADD COLUMN "authMode" TEXT NOT NULL DEFAULT 'PASSWORD';

-- Valid values: 'PASSWORD', 'OTP', 'BOTH'
-- PASSWORD: Traditional password-only authentication (current behavior)
-- OTP: One-Time Password sent to recipient email
-- BOTH: Users can choose either password or OTP
