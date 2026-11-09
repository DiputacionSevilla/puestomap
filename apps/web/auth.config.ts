import type { NextAuthConfig } from "next-auth";
import { envValue } from "./lib/env-file";

const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

// El bundler de proxy/middleware no expone process.env en runtime; envValue()
// completa el valor desde el .env del proyecto (ver ADR-007).
export const authConfig = {
  secret: envValue("AUTH_SECRET"),
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: SESSION_MAX_AGE_SECONDS,
  },
  trustHost: true,
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.role = user.role;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? "";
        session.user.role = token.role ?? "VIEWER";
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
