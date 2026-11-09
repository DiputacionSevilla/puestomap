import { randomBytes } from "node:crypto";

const b64 = (n) => randomBytes(n).toString("base64");

console.log("Pega esto en tu .env (guárdalo también en el gestor de secretos):");
console.log(`AUTH_SECRET=${b64(32)}`);
console.log(`GATEWAY_JWT_SECRET=${b64(32)}`);
console.log(`VNC_ENC_KEY=${b64(32)}`);
