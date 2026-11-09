"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Select } from "@/components/ui/input";

export function MapFloorSwitcher({
  buildings,
  buildingId,
  floorId,
}: {
  buildings: {
    id: string;
    name: string;
    floors: { id: string; name: string; level: number }[];
  }[];
  buildingId: string;
  floorId: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function go(next: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    params.delete("focus");
    router.push(`/mapa?${params.toString()}`);
  }

  const current = buildings.find((b) => b.id === buildingId);

  return (
    <div className="flex items-center gap-2">
      <Select
        value={buildingId}
        onChange={(e) => {
          const building = buildings.find((b) => b.id === e.target.value);
          go({ buildingId: e.target.value, floorId: building?.floors[0]?.id ?? "" });
        }}
        className="h-8 w-52 text-sm"
      >
        {buildings.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </Select>
      <Select
        value={floorId}
        onChange={(e) => go({ floorId: e.target.value })}
        className="h-8 w-44 text-sm"
      >
        {current?.floors.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </Select>
    </div>
  );
}
