const RFB_BANNER = /^RFB (\d{3}\.\d{3})\n$/;

export function parseRfbBanner(buf: Uint8Array): string | null {
  if (buf.length < 12) return null;
  const text = new TextDecoder().decode(buf.subarray(0, 12));
  const match = RFB_BANNER.exec(text);
  return match ? match[1] : null;
}
