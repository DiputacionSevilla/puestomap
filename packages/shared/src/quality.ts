import type { QualityCheck } from "./schemas.js";

export const QUALITY_CHECKS: QualityCheck[] = [
  "sinUbicar",
  "sinDespacho",
  "sinUsuario",
  "usuarioDistinto",
  "sinIp",
  "noVistoOcs",
  "sinOcs",
  "usuarioFueraDirectorio",
  "posicionSolapada",
];

export const QUALITY_LABELS: Record<QualityCheck, string> = {
  sinUbicar: "Sin ubicar en plano",
  sinDespacho: "Sin despacho",
  sinUsuario: "Sin usuario asignado",
  usuarioDistinto: "Usuario distinto al último de OCS",
  sinIp: "Sin IP",
  noVistoOcs: "No visto en OCS hace más de 30 días",
  sinOcs: "Sin inventario OCS",
  usuarioFueraDirectorio: "Usuario fuera del directorio",
  posicionSolapada: "Posición solapada",
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
  ocsId: number | null;
  ocsLastInventory: Date | null;
};

export function qualityChecksFor(
  computer: QualityComputer,
  all: QualityComputer[],
  directory: Set<string>,
  now = new Date(),
): QualityCheck[] {
  const checks: QualityCheck[] = [];
  if (!computer.floorId || computer.posX === null || computer.posY === null) checks.push("sinUbicar");
  if (computer.floorId && !computer.officeId) checks.push("sinDespacho");
  if (!computer.adUsername) checks.push("sinUsuario");
  if (computer.adUsername && computer.lastUserNorm && computer.adUsername !== computer.lastUserNorm) checks.push("usuarioDistinto");
  if (!computer.ip) checks.push("sinIp");
  const stale = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  if (computer.ocsId !== null && (!computer.ocsLastInventory || computer.ocsLastInventory < stale)) checks.push("noVistoOcs");
  if (computer.ocsId === null) checks.push("sinOcs");
  if (directory.size > 0 && computer.adUsername && !directory.has(computer.adUsername)) checks.push("usuarioFueraDirectorio");
  if (computer.floorId && computer.posX !== null && computer.posY !== null && all.some((other) =>
    other.id !== computer.id && other.floorId === computer.floorId && other.posX !== null && other.posY !== null &&
    Math.hypot(other.posX - computer.posX!, other.posY - computer.posY!) < 0.015
  )) checks.push("posicionSolapada");
  return checks;
}
