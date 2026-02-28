-- Add due date fields to Project
ALTER TABLE "Project" ADD COLUMN "dueDate" TIMESTAMP(3);
ALTER TABLE "Project" ADD COLUMN "dueReminder" TEXT;

-- Calendar tokens for iCal feed
CREATE TABLE "CalendarToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CalendarToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CalendarToken_userId_key" ON "CalendarToken"("userId");
CREATE UNIQUE INDEX "CalendarToken_token_key" ON "CalendarToken"("token");
ALTER TABLE "CalendarToken" ADD CONSTRAINT "CalendarToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "Project_dueDate_idx" ON "Project"("dueDate");
