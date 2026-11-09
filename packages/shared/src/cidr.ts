export type ParsedCidr = {
  base: number;
  bits: number;
};

export function ipv4ToInt(ip: string): number | null {
  const parts = ip.trim().split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = value * 256 + octet;
  }
  return value >>> 0;
}

export function parseCidr(cidr: string): ParsedCidr | null {
  const text = cidr.trim();
  const [ipPart, bitsPart] = text.split("/");
  if (ipPart === undefined) return null;
  const ip = ipv4ToInt(ipPart);
  if (ip === null) return null;
  let bits = 32;
  if (bitsPart !== undefined) {
    if (!/^\d{1,2}$/.test(bitsPart)) return null;
    bits = Number(bitsPart);
    if (bits > 32) return null;
  }
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return { base: (ip & mask) >>> 0, bits };
}

export function ipInCidr(ip: string, cidr: string): boolean {
  const ipInt = ipv4ToInt(ip);
  const parsed = parseCidr(cidr);
  if (ipInt === null || parsed === null) return false;
  const mask = parsed.bits === 0 ? 0 : (0xffffffff << (32 - parsed.bits)) >>> 0;
  return ((ipInt & mask) >>> 0) === parsed.base;
}

export function ipInCidrs(ip: string, cidrs: string[]): boolean {
  return cidrs.some((cidr) => ipInCidr(ip, cidr));
}
