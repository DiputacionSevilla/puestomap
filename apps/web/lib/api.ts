import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { auth } from "@/auth";
import type { AppRole } from "@/types/next-auth";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export type AuthedUser = {
  id: string;
  username: string;
  name: string;
  role: AppRole;
};

export async function currentUser(): Promise<AuthedUser | null> {
  const session = await auth();
  const user = session?.user;
  if (!user) return null;
  return {
    id: user.id,
    username: user.username ?? "",
    name: user.name ?? user.username ?? "",
    role: user.role,
  };
}

export async function requireRole(...roles: AppRole[]): Promise<AuthedUser> {
  const user = await currentUser();
  if (!user) throw new ApiError(401, "UNAUTHORIZED", "Sesión requerida");
  if (roles.length > 0 && !roles.includes(user.role)) {
    throw new ApiError(403, "FORBIDDEN", "Sin permisos para esta operación");
  }
  return user;
}

export function jsonOk<T>(data: T, status = 200): NextResponse {
  const body = JSON.stringify(data, (_key, value) =>
    typeof value === "bigint" ? value.toString() : value,
  );
  return new NextResponse(body, {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function errorResponse(err: unknown): NextResponse {
  if (err instanceof ApiError) {
    return NextResponse.json(
      { error: { code: err.code, message: err.message, details: err.details } },
      { status: err.status },
    );
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      { error: { code: "VALIDATION", message: "Datos inválidos", details: err.issues } },
      { status: 422 },
    );
  }
  console.error("[api] error inesperado", err);
  return NextResponse.json(
    { error: { code: "INTERNAL", message: "Error interno del servidor" } },
    { status: 500 },
  );
}

export async function parseBody<T>(
  req: Request,
  schema: { safeParse: (data: unknown) => { success: true; data: T } | { success: false; error: ZodError } },
): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ApiError(400, "BAD_REQUEST", "Cuerpo JSON inválido");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError(422, "VALIDATION", "Datos inválidos", parsed.error.issues);
  }
  return parsed.data;
}
