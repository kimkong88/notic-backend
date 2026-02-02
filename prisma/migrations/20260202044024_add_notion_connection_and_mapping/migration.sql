-- CreateTable
CREATE TABLE "NotionConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "notionWorkspaceId" TEXT NOT NULL,
    "notionWorkspaceName" TEXT,
    "syncRootPageId" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotionConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotionSyncMapping" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "notionPageId" TEXT NOT NULL,
    "notionWorkspaceId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotionSyncMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NotionConnection_userId_key" ON "NotionConnection"("userId");

-- CreateIndex
CREATE INDEX "NotionConnection_userId_idx" ON "NotionConnection"("userId");

-- CreateIndex
CREATE INDEX "NotionSyncMapping_userId_idx" ON "NotionSyncMapping"("userId");

-- CreateIndex
CREATE INDEX "NotionSyncMapping_userId_entityType_idx" ON "NotionSyncMapping"("userId", "entityType");

-- CreateIndex
CREATE UNIQUE INDEX "NotionSyncMapping_userId_entityType_clientId_key" ON "NotionSyncMapping"("userId", "entityType", "clientId");

-- AddForeignKey
ALTER TABLE "NotionConnection" ADD CONSTRAINT "NotionConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotionSyncMapping" ADD CONSTRAINT "NotionSyncMapping_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
