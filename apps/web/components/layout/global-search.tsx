"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

type SearchResult = {
  id: string;
  hostname: string;
  ip: string | null;
  lastUser: string | null;
};

export function GlobalSearch({ className }: { className?: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selected, setSelected] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/computers?q=${encodeURIComponent(q)}&pageSize=6`, { signal: controller.signal })
        .then((res) => (res.ok ? res.json() : { items: [] }))
        .then((data: { items?: SearchResult[] }) => {
          setResults(data.items ?? []);
          setSelected(0);
          setOpen(true);
        })
        .catch(() => undefined);
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const openResult = useCallback(
    (result: SearchResult, alt: boolean) => {
      setOpen(false);
      if (alt) {
        window.open(`/remote/${result.id}`, "_blank", "noopener");
      } else {
        router.push(`/equipos/${result.id}`);
      }
    },
    [router],
  );

  return (
    <div className={cn("relative w-full max-w-md", className)}>
      <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Buscar equipo, IP o usuario…  (Ctrl+K)"
        className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-16 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onKeyDown={(e) => {
          if (results.length === 0) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setSelected((s) => Math.min(s + 1, results.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setSelected((s) => Math.max(s - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            const result = results[selected];
            if (result) openResult(result, e.altKey);
          }
        }}
      />
      <kbd className="pointer-events-none absolute right-2 top-2 hidden rounded border bg-muted px-1.5 text-[10px] text-muted-foreground sm:inline">
        Ctrl+K
      </kbd>
      {open && results.length > 0 ? (
        <ul className="absolute z-40 mt-1 w-full overflow-hidden rounded-md border bg-background shadow-lg">
          {results.map((result, index) => (
            <li key={result.id}>
              <button
                type="button"
                className={cn(
                  "flex w-full items-center justify-between px-3 py-2 text-left text-sm",
                  index === selected ? "bg-accent" : "hover:bg-accent/50",
                )}
                onMouseDown={(e) => {
                  e.preventDefault();
                  openResult(result, false);
                }}
              >
                <span className="font-medium">{result.hostname}</span>
                <span className="text-xs text-muted-foreground">
                  {result.ip ?? "sin IP"} · {result.lastUser ?? "—"}
                </span>
              </button>
            </li>
          ))}
          <li className="border-t px-3 py-1.5 text-[11px] text-muted-foreground">
            Enter: ficha · Alt+Enter: asistencia web
          </li>
        </ul>
      ) : null}
    </div>
  );
}
