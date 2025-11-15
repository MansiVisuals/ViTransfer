-- Add PassKey (WebAuthn) authentication support
-- Following SimpleWebAuthn recommended schema patterns
-- Enables phishing-resistant, passwordless admin authentication

-- Create PasskeyCredential table
CREATE TABLE "PasskeyCredential" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    -- WebAuthn credential data (binary fields for cryptographic material)
    "credentialID" BYTEA NOT NULL,
    "publicKey" BYTEA NOT NULL,
    "counter" BIGINT NOT NULL,

    -- UX and security metadata
    "transports" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "deviceType" TEXT NOT NULL,
    "backedUp" BOOLEAN NOT NULL DEFAULT false,
    "aaguid" TEXT,
    "userAgent" TEXT,
    "credentialName" TEXT,

    -- Security tracking
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedIP" TEXT,

    CONSTRAINT "PasskeyCredential_pkey" PRIMARY KEY ("id")
);

-- Create unique index on credentialID (prevents duplicate registration)
CREATE UNIQUE INDEX "PasskeyCredential_credentialID_key" ON "PasskeyCredential"("credentialID");

-- Create indexes for performance
CREATE INDEX "PasskeyCredential_userId_idx" ON "PasskeyCredential"("userId");
CREATE INDEX "PasskeyCredential_userId_lastUsedAt_idx" ON "PasskeyCredential"("userId", "lastUsedAt");

-- Add foreign key constraint (cascade delete when user is deleted)
ALTER TABLE "PasskeyCredential" ADD CONSTRAINT "PasskeyCredential_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
