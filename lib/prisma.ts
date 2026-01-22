import { PrismaClient } from "@prisma/client";

declare global {
  // allow global prisma in development to avoid hot-reload problems
  var prisma: PrismaClient | undefined;
}

export const prisma = global.prisma || new PrismaClient();

if (process.env.NODE_ENV === "development") global.prisma = prisma;
