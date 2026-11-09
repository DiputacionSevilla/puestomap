import type { LatLng, PlanSize } from "./types.js";

export type Rect = { x: number; y: number; w: number; h: number };

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

export function findOfficeAt(
  offices: { id: string; rect: Rect | null }[],
  x: number,
  y: number,
): string | null {
  const hits = offices.filter(
    (office) =>
      office.rect !== null &&
      x >= office.rect.x &&
      x <= office.rect.x + office.rect.w &&
      y >= office.rect.y &&
      y <= office.rect.y + office.rect.h,
  );
  if (hits.length === 0) return null;
  hits.sort((a, b) => {
    const ra = a.rect as Rect;
    const rb = b.rect as Rect;
    return ra.w * ra.h - rb.w * rb.h;
  });
  return hits[0].id;
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export function aspectChanged(
  prev: { w: number; h: number },
  next: { w: number; h: number },
  tol = 0.01,
): boolean {
  if (prev.h === 0 || next.h === 0) return true;
  const prevAspect = prev.w / prev.h;
  const nextAspect = next.w / next.h;
  return Math.abs(nextAspect - prevAspect) / prevAspect > tol;
}
