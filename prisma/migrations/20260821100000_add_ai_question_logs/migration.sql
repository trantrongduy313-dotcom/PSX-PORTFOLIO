-- CreateTable
CREATE TABLE "ai_question_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "userRole" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "pageUrl" TEXT,
    "sourceIds" TEXT[],
    "wasUnanswered" BOOLEAN NOT NULL DEFAULT false,
    "droppedIds" TEXT[],
    "tokensIn" INTEGER NOT NULL DEFAULT 0,
    "tokensOut" INTEGER NOT NULL DEFAULT 0,
    "tokensCacheRead" INTEGER NOT NULL DEFAULT 0,
    "wasHelpful" BOOLEAN,
    "feedbackReportId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_question_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_question_logs_userId_createdAt_idx" ON "ai_question_logs"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ai_question_logs_createdAt_idx" ON "ai_question_logs"("createdAt");

-- CreateIndex
CREATE INDEX "ai_question_logs_wasUnanswered_idx" ON "ai_question_logs"("wasUnanswered");

-- AddForeignKey
ALTER TABLE "ai_question_logs" ADD CONSTRAINT "ai_question_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
