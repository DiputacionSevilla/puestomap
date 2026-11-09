import { describe, expect, it } from "vitest";
import { qualityChecksFor, validateDirectoryImport } from "@puestomap/shared";

describe("directorio y calidad CR-01", () => {
  it("valida, normaliza e identifica una importación idempotente", () => {
    const rows = [{ samaccountname: "AYTO\\JLopez", displayname: "Juana López", department: "Secretaría" }];
    const first = validateDirectoryImport(rows, []);
    expect(first[0].action).toBe("crear");
    expect(first[0].values?.username).toBe("jlopez");
    expect(validateDirectoryImport(rows, [first[0].values!])[0].action).toBe("sin cambios");
    expect(validateDirectoryImport([{ samaccountname: "", displayname: "" }], [])[0].errors).toHaveLength(2);
  });

  it("calcula checks, directorio y solapes con las condiciones especificadas", () => {
    const now = new Date("2026-11-09T12:00:00Z");
    const rows = [
      { id: "a", floorId: "f", officeId: null, posX: 0.1, posY: 0.1, adUsername: "otro", lastUserNorm: "jlopez", ip: null, ocsId: 1, ocsLastInventory: null },
      { id: "b", floorId: "f", officeId: "o", posX: 0.11, posY: 0.1, adUsername: null, lastUserNorm: null, ip: "10.0.0.2", ocsId: null, ocsLastInventory: null },
    ];
    expect(qualityChecksFor(rows[0], rows, new Set(["jlopez"]), now)).toEqual(expect.arrayContaining(["sinDespacho", "usuarioDistinto", "sinIp", "noVistoOcs", "usuarioFueraDirectorio", "posicionSolapada"]));
    expect(qualityChecksFor(rows[1], rows, new Set(["jlopez"]), now)).toEqual(expect.arrayContaining(["sinUsuario", "sinOcs", "posicionSolapada"]));
  });
});
