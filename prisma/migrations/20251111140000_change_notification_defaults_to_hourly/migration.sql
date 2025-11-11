-- Change default notification schedule from IMMEDIATE to HOURLY
-- Note: Approval emails remain IMMEDIATE regardless of this setting

-- Update existing Settings records that are using IMMEDIATE to HOURLY
UPDATE "Settings" SET "adminNotificationSchedule" = 'HOURLY' WHERE "adminNotificationSchedule" = 'IMMEDIATE';

-- Update existing Project records that are using IMMEDIATE to HOURLY
UPDATE "Project" SET "clientNotificationSchedule" = 'HOURLY' WHERE "clientNotificationSchedule" = 'IMMEDIATE';

-- Note: New records will automatically use HOURLY due to schema default change
