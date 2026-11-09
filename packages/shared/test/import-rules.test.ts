import { describe, expect, it } from "vitest";
import { parseCsvTable } from "@puestomap/shared";

describe("parseCsvTable", () => {
  it("lee por cabecera con tildes/mayúsculas y comillas", () => {
    const { rows } = parseCsvTable(
      "﻿HostName;Usuario_Dominio;Notas\r\nPC-01;AYTO\\jgarcia;\"Con; punto y coma\"\r\n",
    );
    expect(rows[0].hostname).toBe("PC-01");
    expect(rows[0].usuario_dominio).toBe("AYTO\\jgarcia");
    expect(rows[0].notas).toBe("Con; punto y coma");
  });
});
