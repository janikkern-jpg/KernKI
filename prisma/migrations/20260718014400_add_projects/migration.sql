-- Add Project model + Conversation.projectId (nullable, ON DELETE SET NULL).
-- Manuell erzeugt (offline, ohne Datenbank), analog zum init-Migration-Stil.

-- CreateTable: Project
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "instructions" TEXT,
    "color" TEXT NOT NULL DEFAULT '#22c55e',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Project_userId_idx" ON "Project"("userId");
CREATE INDEX "Project_userId_updatedAt_idx" ON "Project"("userId", "updatedAt");

-- AddForeignKey: Project.userId → User.id (CASCADE)
ALTER TABLE "Project"
    ADD CONSTRAINT "Project_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: Conversation → projectId (nullable)
ALTER TABLE "Conversation" ADD COLUMN "projectId" TEXT;

-- CreateIndex
CREATE INDEX "Conversation_projectId_idx" ON "Conversation"("projectId");

-- AddForeignKey: Conversation.projectId → Project.id (SET NULL)
ALTER TABLE "Conversation"
    ADD CONSTRAINT "Conversation_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
