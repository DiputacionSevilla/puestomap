import type { QualityCheck } from "./schemas.js";

export const QUALITY_CHECKS: QualityCheck[] = [
  "sinColocar",
  "sinLugar",
  "sinUsuario",
  "usuarioDistinto",
  "sinIp",
  "sinInventario",
  "noEnGlpi",
  "usuarioFueraDirectorio",
  "posicionSolapada",
];

export const QUALITY_LABELS: Record<QualityCheck, string> = {
  sinColocar: "Con planta pero sin colocar en el plano",
  sinLugar: "Sin lugar en GLPI",
  sinUsuario: "Sin usuario asignado en GLPI",
  usuarioDistinto: "Usuario asignado distinto al último inventariado",
  sinIp: "Sin IP",
  sinInventario: "Sin inventario reciente (más de 30 días)",
  noEnGlpi: "No enlazado con GLPI",
  usuarioFueraDirectorio: "Usuario fuera del directorio",
  posicionSolapada: "Posición solapada",
};

/** Dónde se corrige cada check: «glpi» ⇒ la ficha ofrece «Corregir en GLPI» (specs/11 RF-24). */
export const QUALITY_FIX_IN: Record<QualityCheck, "glpi" | "puestomap"> = {
  sinColocar: "puestomap",
  sinLugar: "glpi",
  sinUsuario: "glpi",
  usuarioDistinto: "glpi",
  sinIp: "glpi",
  sinInventario: "glpi",
  noEnGlpi: "glpi",
  usuarioFueraDirectorio: "glpi",
  posicionSolapada: "puestomap",
};

export type QualityComputer = {
  id: string;
  floorId: string | null;
  officeId: string | null;
  posX: number | null;
  posY: number | null;
  adUsername: string | null;
  lastUserNorm: string | null;
  ip: string | null;
  glpiId: number | null;
  lastInventoryAt: Date | null;
};

export function qualityChecksFor(
  computer: QualityComputer,
  all: QualityComputer[],
  directory: Set<string>,
  now = new Date(),
): QualityCheck[] {
  const checks: QualityCheck[] = [];
  if (computer.floorId && (computer.posX === null || computer.posY === null)) checks.push("sinColocar");
  if (!computer.floorId) checks.push("sinLugar");
  if (!computer.adUsername) checks.push("sinUsuario");
  if (computer.adUsername && computer.lastUserNorm && computer.adUsername !== computer.lastUserNorm) checks.push("usuarioDistinto");
  if (!computer.ip) checks.push("sinIp");
  const stale = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  if (computer.glpiId !== null && (!computer.lastInventoryAt || computer.lastInventoryAt < stale)) checks.push("sinInventario");
  if (computer.glpiId === null) checks.push("noEnGlpi");
  if (directory.size > 0 && computer.adUsername && !directory.has(computer.adUsername)) checks.push("usuarioFueraDirectorio");
  if (computer.floorId && computer.posX !== null && computer.posY !== null && all.some((other) =>
    other.id !== computer.id && other.floorId === computer.floorId && other.posX !== null && other.posY !== null &&
    Math.hypot(other.posX - computer.posX!, other.posY - computer.posY!) < 0.015
  )) checks.push("posicionSolapada");
  return checks;
}
