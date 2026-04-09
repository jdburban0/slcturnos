-- CreateEnum
CREATE TYPE "Role" AS ENUM ('operator', 'lead', 'admin');

-- CreateEnum
CREATE TYPE "ShiftType" AS ENUM ('DAY', 'NIGHT');

-- CreateEnum
CREATE TYPE "ShiftStatus" AS ENUM ('OPEN', 'FULL', 'CLOSED');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'operator',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shift" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "type" "ShiftType" NOT NULL,
    "totalSlots" INTEGER NOT NULL,
    "status" "ShiftStatus" NOT NULL DEFAULT 'OPEN',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Shift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftRequest" (
    "id" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "holdExpiresAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShiftRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "ShiftRequest_shiftId_status_idx" ON "ShiftRequest"("shiftId", "status");

-- CreateIndex
CREATE INDEX "ShiftRequest_userId_status_idx" ON "ShiftRequest"("userId", "status");

-- AddForeignKey
ALTER TABLE "ShiftRequest" ADD CONSTRAINT "ShiftRequest_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftRequest" ADD CONSTRAINT "ShiftRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
