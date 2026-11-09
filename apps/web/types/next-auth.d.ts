import type { DefaultSession } from "next-auth";

export type AppRole = "ADMIN" | "TECH" | "VIEWER";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      username: string;
      role: AppRole;
    } & DefaultSession["user"];
  }

  interface User {
    username?: string;
    role?: AppRole;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    role?: AppRole;
  }
}
