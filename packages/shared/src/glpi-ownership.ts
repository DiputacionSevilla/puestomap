/** Campos de Computer cuyo dueño es GLPI (specs/11 §3): no editables en PuestoMap si el equipo está enlazado. */
export const GLPI_READONLY_PATCH_FIELDS = ["assetTag", "adUsername", "assignedTo", "phoneExt"] as const;

/** Devuelve los campos del PATCH que intentan modificar datos propiedad de GLPI (vacío si el equipo no está enlazado). */
export function glpiOwnedFieldsInPatch(
  input: Record<string, unknown>,
  computer: { glpiId: number | null },
): string[] {
  if (computer.glpiId === null || computer.glpiId === undefined) return [];
  return GLPI_READONLY_PATCH_FIELDS.filter((field) => input[field] !== undefined);
}
