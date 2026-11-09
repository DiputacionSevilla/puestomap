import { ApiError } from "@/lib/api";

/** CR-02: importaciones y alta manual de equipos quedan ocultas salvo LEGACY_IMPORT_ENABLED=true. */
export function legacyImportEnabled(): boolean {
  return process.env.LEGACY_IMPORT_ENABLED === "true";
}

export function requireLegacyImport(): void {
  if (!legacyImportEnabled()) {
    throw new ApiError(404, "NOT_FOUND", "Función retirada: el inventario se gestiona en GLPI (CR-02)");
  }
}
