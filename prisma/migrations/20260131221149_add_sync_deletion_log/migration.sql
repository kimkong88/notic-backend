-- CreateEnum
CREATE TYPE "DeletedEntityType" AS ENUM ('note', 'folder', 'workspace');

-- CreateTable
CREATE TABLE "SyncDeletionLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityType" "DeletedEntityType" NOT NULL,
    "clientId" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncDeletionLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SyncDeletionLog_userId_deletedAt_idx" ON "SyncDeletionLog"("userId", "deletedAt" DESC);

-- CreateIndex
CREATE INDEX "SyncDeletionLog_userId_entityType_deletedAt_idx" ON "SyncDeletionLog"("userId", "entityType", "deletedAt" DESC);

-- AddForeignKey
ALTER TABLE "SyncDeletionLog" ADD CONSTRAINT "SyncDeletionLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
