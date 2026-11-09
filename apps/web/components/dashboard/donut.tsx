export type DonutSlice = { label: string; value: number; color: string };

/** Donut en SVG propio (sin librerías): el total en el centro y leyenda accesible. */
export function Donut({ slices, title }: { slices: DonutSlice[]; title: string }) {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <figure className="flex flex-col items-center gap-3 sm:flex-row">
      <svg viewBox="0 0 120 120" className="h-36 w-36 shrink-0" role="img" aria-label={`${title}: ${total} equipos`}>
        <circle cx="60" cy="60" r={radius} fill="none" stroke="hsl(var(--muted))" strokeWidth="16" />
        {total > 0 ? slices.filter((s) => s.value > 0).map((s) => {
          const length = (s.value / total) * circumference;
          const circle = (
            <circle
              key={s.label}
              cx="60" cy="60" r={radius} fill="none" stroke={s.color} strokeWidth="16"
              strokeDasharray={`${length} ${circumference - length}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 60 60)"
            />
          );
          offset += length;
          return circle;
        }) : null}
        <text x="60" y="66" textAnchor="middle" className="fill-foreground" style={{ fontSize: 22, fontWeight: 600 }}>{total}</text>
      </svg>
      <figcaption className="space-y-1 text-sm">
        <div className="font-medium">{title}</div>
        {slices.map((s) => (
          <div key={s.label} className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ background: s.color }} aria-hidden />
            <span className="text-muted-foreground">{s.label}</span>
            <span className="ml-auto pl-3 tabular-nums">{s.value}</span>
          </div>
        ))}
      </figcaption>
    </figure>
  );
}
