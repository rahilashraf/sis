-- CreateTable
CREATE TABLE "GradeRecord" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "maxScore" DOUBLE PRECISION NOT NULL,
    "gradedAt" TIMESTAMP(3) NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GradeRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GradeRecord_classId_gradedAt_idx" ON "GradeRecord"("classId", "gradedAt");

-- CreateIndex
CREATE INDEX "GradeRecord_studentId_gradedAt_idx" ON "GradeRecord"("studentId", "gradedAt");

-- CreateIndex
CREATE INDEX "GradeRecord_classId_studentId_idx" ON "GradeRecord"("classId", "studentId");

-- AddForeignKey
ALTER TABLE "GradeRecord"
ADD CONSTRAINT "GradeRecord_classId_fkey"
FOREIGN KEY ("classId") REFERENCES "Class"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradeRecord"
ADD CONSTRAINT "GradeRecord_studentId_fkey"
FOREIGN KEY ("studentId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
