import { describe, expect, it } from "vitest";
import { ipInCidr, ipInCidrs, ipv4ToInt, parseCidr } from "@puestomap/shared";

describe("cidr (T-U3)", () => {
  it("IP dentro de la red", () => {
    expect(ipInCidr("10.1.2.3", "10.0.0.0/8")).toBe(true);
    expect(ipInCidr("192.168.1.5", "192.168.0.0/16")).toBe(true);
    expect(ipInCidr("10.1.2.3", "10.1.2.3/32")).toBe(true);
    expect(ipInCidr("8.8.8.8", "0.0.0.0/0")).toBe(true);
  });

  it("IP fuera de la red", () => {
    expect(ipInCidr("192.168.1.5", "10.0.0.0/8")).toBe(false);
    expect(ipInCidr("10.1.2.3", "10.1.3.0/24")).toBe(false);
    expect(ipInCidr("10.1.2.4", "10.1.2.3/32")).toBe(false);
  });

  it("varias redes", () => {
    const networks = ["10.0.0.0/8", "192.168.0.0/16"];
    expect(ipInCidrs("192.168.50.1", networks)).toBe(true);
    expect(ipInCidrs("172.16.0.1", networks)).toBe(false);
    expect(ipInCidrs("no-es-ip", networks)).toBe(false);
  });

  it("entradas inválidas", () => {
    expect(ipv4ToInt("300.1.1.1")).toBeNull();
    expect(ipv4ToInt("1.2.3")).toBeNull();
    expect(ipv4ToInt("texto")).toBeNull();
    expect(parseCidr("10.0.0.0/33")).toBeNull();
    expect(parseCidr("10.0.0.0/xx")).toBeNull();
    expect(parseCidr("")).toBeNull();
    expect(ipInCidr("no-es-ip", "10.0.0.0/8")).toBe(false);
    expect(ipInCidr("10.1.1.1", "mala")).toBe(false);
  });
});
