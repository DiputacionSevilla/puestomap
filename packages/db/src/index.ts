export { PrismaClient, Prisma } from "@prisma/client";
export type * from "@prisma/client";

import { PrismaClient } from "@prisma/client";

let instance: PrismaClient | null = null;

export function getPrisma(): PrismaClient {
  if (instance === null) {
    instance = new PrismaClient();
  }
  return instance;
}
