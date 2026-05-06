-- AdminSavedView: per-user saved filter/sort presets for the Projects Dashboard

CREATE TABLE "AdminSavedView" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "state" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AdminSavedView_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "AdminSavedView" ADD CONSTRAINT "AdminSavedView_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "AdminSavedView_userId_idx" ON "AdminSavedView"("userId");
