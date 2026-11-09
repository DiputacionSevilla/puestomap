import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "./auth.config";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const path = req.nextUrl.pathname;
  const isPublic =
    path === "/login" || path.startsWith("/api/health") || path.startsWith("/api/auth");

  if (isPublic) return NextResponse.next();

  if (!req.auth) {
    const login = new URL("/login", req.nextUrl);
    const back = `${path}${req.nextUrl.search}`;
    if (back !== "/") login.searchParams.set("callbackUrl", back);
    return NextResponse.redirect(login);
  }

  const role = req.auth.user?.role;
  if (path.startsWith("/auditoria") && role !== "ADMIN") {
    return NextResponse.redirect(new URL("/", req.nextUrl));
  }
  if (path.startsWith("/importar") && role === "VIEWER") {
    return NextResponse.redirect(new URL("/", req.nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
