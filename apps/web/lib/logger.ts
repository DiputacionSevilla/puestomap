type LogLevel = "debug" | "info" | "warn" | "error";

const levels: LogLevel[] = ["debug", "info", "warn", "error"];

function serialize(value: unknown): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  return value;
}

export function log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
  const configured = process.env.LOG_LEVEL as LogLevel | undefined;
  const minimum = levels.includes(configured ?? "info") ? (configured ?? "info") : "info";
  if (levels.indexOf(level) < levels.indexOf(minimum)) return;

  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    service: "web",
    message,
    ...Object.fromEntries(Object.entries(data ?? {}).map(([key, value]) => [key, serialize(value)])),
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}
