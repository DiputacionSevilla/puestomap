import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { getPrisma } from "@puestomap/db";
import { authConfig } from "./auth.config";
import { audit } from "./lib/audit";

const credentialsSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export const MAX_FAILED_LOGINS = 5;
export const LOCK_MINUTES = 15;

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        username: { label: "Usuario", type: "text" },
        password: { label: "Contraseña", type: "password" },
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;
        const { username, password } = parsed.data;
        const prisma = getPrisma();

        const user = await prisma.user.findFirst({
          where: { username: { equals: username, mode: "insensitive" } },
        });
        if (!user) {
          await audit({ action: "auth.login_failed", data: { username } });
          return null;
        }

        const now = new Date();
        if (user.lockedUntil && user.lockedUntil > now) {
          await audit({ userId: user.id, action: "auth.locked", entity: "User", entityId: user.id });
          return null;
        }

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) {
          const failedLogins = user.failedLogins + 1;
          const shouldLock = failedLogins >= MAX_FAILED_LOGINS;
          await prisma.user.update({
            where: { id: user.id },
            data: {
              failedLogins: shouldLock ? 0 : failedLogins,
              lockedUntil: shouldLock ? new Date(now.getTime() + LOCK_MINUTES * 60 * 1000) : null,
            },
          });
          await audit({
            userId: user.id,
            action: shouldLock ? "auth.locked" : "auth.login_failed",
            entity: "User",
            entityId: user.id,
            data: { failedLogins },
          });
          return null;
        }

        if (!user.active) {
          await audit({ userId: user.id, action: "auth.login_failed", entity: "User", entityId: user.id, data: { reason: "inactive" } });
          return null;
        }

        await prisma.user.update({
          where: { id: user.id },
          data: { failedLogins: 0, lockedUntil: null, lastLoginAt: now },
        });
        await audit({ userId: user.id, action: "auth.login", entity: "User", entityId: user.id });

        return {
          id: user.id,
          name: user.name,
          username: user.username,
          role: user.role,
        };
      },
    }),
  ],
});
