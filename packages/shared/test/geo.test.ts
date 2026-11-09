import { describe, expect, it } from "vitest";
import { fromLatLng, toLatLng } from "@puestomap/shared";

const size = { planWidth: 1000, planHeight: 500 };

describe("geo (T-U6)", () => {
  it("ida y vuelta", () => {
    const pos = { posX: 0.4215, posY: 0.338 };
    const latlng = toLatLng(pos.posX, pos.posY, size);
    const back = fromLatLng(latlng.lat, latlng.lng, size);
    expect(back.posX).toBeCloseTo(pos.posX, 10);
    expect(back.posY).toBeCloseTo(pos.posY, 10);
  });

  it("esquina (0,0): arriba a la izquierda", () => {
    const latlng = toLatLng(0, 0, size);
    expect(latlng).toEqual({ lat: 500, lng: 0 });
  });

  it("esquina (1,1): abajo a la derecha", () => {
    const latlng = toLatLng(1, 1, size);
    expect(latlng).toEqual({ lat: 0, lng: 1000 });
    const back = fromLatLng(0, 1000, size);
    expect(back).toEqual({ posX: 1, posY: 1 });
  });
});
