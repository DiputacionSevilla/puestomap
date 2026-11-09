import { describe, expect, it } from "vitest";
import { glpiOwnedFieldsInPatch } from "@puestomap/shared";

describe("PATCH y propiedad de GLPI (T-I8)", () => {
  it("rechaza campos propiedad de GLPI en equipos enlazados", () => {
    expect(glpiOwnedFieldsInPatch({ assetTag: "X", adUsername: "u", notes: "n" }, { glpiId: 5 })).toEqual(["assetTag", "adUsername"]);
    expect(glpiOwnedFieldsInPatch({ assignedTo: "a", phoneExt: "1" }, { glpiId: 5 })).toEqual(["assignedTo", "phoneExt"]);
  });
  it("permite editar lo local: notas, VNC y posición", () => {
    expect(glpiOwnedFieldsInPatch({ notes: "n", vncPort: 5901, posX: 0.2, posY: 0.3, credentialId: "c" }, { glpiId: 5 })).toEqual([]);
  });
  it("equipos no enlazados conservan la edición legada", () => {
    expect(glpiOwnedFieldsInPatch({ assetTag: "X" }, { glpiId: null })).toEqual([]);
  });
});
