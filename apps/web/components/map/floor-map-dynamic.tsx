"use client";

import dynamic from "next/dynamic";

export const FloorMapDynamic = dynamic(
  () => import("./floor-map").then((m) => m.FloorMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[calc(100vh-8rem)] items-center justify-center rounded-lg border">
        <p className="text-sm text-muted-foreground">Cargando plano…</p>
      </div>
    ),
  },
);
