export type SvgValidationResult = {
  ok: boolean;
  width?: number;
  height?: number;
  errors: string[];
};

const FORBIDDEN_TAGS = ["script", "foreignObject", "iframe", "embed", "object"];

function parseLength(value: string): number | null {
  const match = /^\s*(\d+(?:\.\d+)?)\s*(px)?\s*$/i.exec(value);
  if (!match) return null;
  return Number(match[1]);
}

export function validateSvg(
  content: string | Uint8Array,
  maxBytes: number,
): SvgValidationResult {
  const text =
    typeof content === "string" ? content : new TextDecoder().decode(content);
  const errors: string[] = [];

  const bytes =
    typeof content === "string" ? new TextEncoder().encode(content).length : content.byteLength;
  if (bytes > maxBytes) {
    errors.push(`el SVG supera el tamaño máximo de ${maxBytes} bytes`);
  }

  for (const tag of FORBIDDEN_TAGS) {
    if (new RegExp(`<${tag}[\\s/>]`, "i").test(text)) {
      errors.push(`contiene la etiqueta prohibida <${tag}>`);
    }
  }
  if (/\son\w+\s*=/i.test(text)) {
    errors.push("contiene manejadores de eventos on*");
  }
  if (/javascript:/i.test(text)) {
    errors.push("contiene javascript:");
  }
  if (/<!ENTITY/i.test(text)) {
    errors.push("contiene declaraciones <!ENTITY");
  }

  const hrefPattern = /(?:xlink:href|href)\s*=\s*"([^"]*)"/gi;
  for (const match of text.matchAll(hrefPattern)) {
    const value = (match[1] ?? "").trim();
    if (!value.startsWith("#") && !value.toLowerCase().startsWith("data:image/")) {
      errors.push(`href no permitido: ${value.slice(0, 40)}`);
    }
  }

  const svgTag = /<svg\b[^>]*>/i.exec(text)?.[0] ?? "";
  const widthAttr = /\bwidth\s*=\s*"([^"]*)"/i.exec(svgTag)?.[1];
  const heightAttr = /\bheight\s*=\s*"([^"]*)"/i.exec(svgTag)?.[1];
  let width = widthAttr !== undefined ? parseLength(widthAttr) : null;
  let height = heightAttr !== undefined ? parseLength(heightAttr) : null;

  if (width === null || height === null) {
    const viewBox = /\bviewBox\s*=\s*"([^"]*)"/i.exec(svgTag)?.[1];
    if (viewBox) {
      const parts = viewBox.trim().split(/[\s,]+/).map(Number);
      if (parts.length === 4 && parts.every((n) => Number.isFinite(n)) && parts[2] > 0 && parts[3] > 0) {
        width = parts[2];
        height = parts[3];
      }
    }
  }

  if (width === null || height === null || width <= 0 || height <= 0) {
    errors.push("el SVG no tiene dimensiones válidas (width/height o viewBox)");
  }

  return {
    ok: errors.length === 0,
    width: width ?? undefined,
    height: height ?? undefined,
    errors,
  };
}
