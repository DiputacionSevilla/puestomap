import { SignJWT, jwtVerify } from "jose";

export type GatewayTokenPayload = {
  sid: string;
};

export const GATEWAY_TOKEN_TTL_SECONDS = 60;

export async function signGatewayToken(
  payload: GatewayTokenPayload,
  secret: string,
  ttlSeconds: number = GATEWAY_TOKEN_TTL_SECONDS,
): Promise<string> {
  return new SignJWT({ sid: payload.sid })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(new TextEncoder().encode(secret));
}

export async function verifyGatewayToken(
  token: string,
  secret: string,
): Promise<GatewayTokenPayload> {
  const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
    algorithms: ["HS256"],
  });
  if (typeof payload.sid !== "string" || payload.sid.length === 0) {
    throw new Error("Token sin sesión (sid)");
  }
  return { sid: payload.sid };
}
