import { decryptSecret, encryptSecret } from "@puestomap/shared/crypto";
import { ApiError } from "@/lib/api";

export const VNC_PASSWORD_MAX = 8;

export function getVncEncKey(): string {
  const key = process.env.VNC_ENC_KEY;
  if (!key) {
    throw new ApiError(500, "CONFIG", "Falta VNC_ENC_KEY en la configuración del servidor");
  }
  return key;
}

export function encryptVncPassword(plain: string): { passwordEnc: string; truncated: boolean } {
  const value = plain.length > VNC_PASSWORD_MAX ? plain.slice(0, VNC_PASSWORD_MAX) : plain;
  return {
    passwordEnc: encryptSecret(value, getVncEncKey()),
    truncated: plain.length > VNC_PASSWORD_MAX,
  };
}

export function decryptVncPassword(passwordEnc: string): string {
  return decryptSecret(passwordEnc, getVncEncKey());
}
