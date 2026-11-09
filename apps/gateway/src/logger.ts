type LogLevel = "debug" | "info" | "warn" | "error";
const levels: LogLevel[] = ["debug", "info", "warn", "error"];

function serialize(value: unknown): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  return value;
}

function write(level: LogLevel, args: unknown[]): void {
  const configured = process.env.LOG_LEVEL as LogLevel | undefined;
  const minimum = levels.includes(configured ?? "info") ? (configured ?? "info") : "info";
  if (levels.indexOf(level) < levels.indexOf(minimum)) return;
  const [message, ...details] = args;
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    service: "gateway",
    message: typeof message === "string" ? message : "Evento del gateway",
    details: details.map(serialize),
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  info: (...args: unknown[]) => write("info", args),
  warn: (...args: unknown[]) => write("warn", args),
  error: (...args: unknown[]) => write("error", args),
};
