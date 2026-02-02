-- AlterTable
ALTER TABLE "Note" ADD COLUMN "shareCode" TEXT;

-- CreateIndex (unique; Postgres allows multiple NULLs)
CREATE UNIQUE INDEX "Note_shareCode_key" ON "Note"("shareCode");
