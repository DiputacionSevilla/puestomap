"use server";

import { AuthError } from "next-auth";
import { getPrisma } from "@puestomap/db";
import { signIn } from "@/auth";

export async function authenticate(
  _prevState: string | undefined,
  formData: FormData,
): Promise<string | undefined> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!username || !password) {
    return "Introduce usuario y contraseña.";
  }

  const prisma = getPrisma();
  const user = await prisma.user.findFirst({
    where: { username: { equals: username, mode: "insensitive" } },
  });
  if (user?.lockedUntil && user.lockedUntil > new Date()) {
    return "Cuenta bloqueada temporalmente por intentos fallidos. Reintenta en unos minutos.";
  }

  try {
    await signIn("credentials", { username, password, redirectTo: "/" });
    return undefined;
  } catch (error) {
    if (error instanceof AuthError) {
      return "Usuario o contraseña incorrectos.";
    }
    throw error;
  }
}
