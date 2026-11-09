import type { LatLng, PlanSize } from "./types.js";

export function toLatLng(posX: number, posY: number, size: PlanSize): LatLng {
  return {
    lat: (1 - posY) * size.planHeight,
    lng: posX * size.planWidth,
  };
}

export function fromLatLng(
  lat: number,
  lng: number,
  size: PlanSize,
): { posX: number; posY: number } {
  return {
    posX: lng / size.planWidth,
    posY: 1 - lat / size.planHeight,
  };
}
