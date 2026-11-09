import { getPrisma } from "@puestomap/db";
import { sessionCreateSchema, type SessionCreateInput } from "@puestomap/shared";
import { signGatewayToken } from "@puestomap/shared/token";
import { decryptSecret } from "@puestomap/shared/crypto";
import { ApiError, errorResponse, jsonOk, parseBody, requireRole } from "@/lib/api";
import { audit, clientIp } from "@/lib/audit";
import { envValue } from "@/lib/env-file";

export const dynamic = "force-dynamic";

function gatewayJwtSecret(): string {
  const secret = envValue("GATEWAY_JWT_SECRET");
  if (!secret) {
    throw new ApiError(500, "CONFIG", "Falta GATEWAY_JWT_SECRET en la configuración del servidor");
  }
  return secret;
}

function vncPasswordFor(passwordEnc: string | null): string | null {
  if (!passwordEnc) return null;
  const key = envValue("VNC_ENC_KEY");
  if (!key) {
    throw new ApiError(500, "CONFIG", "Falta VNC_ENC_KEY en la configuración del servidor");
  }
  return decryptSecret(passwordEnc, key);
}

async function resolveTarget(computerId: string, input: SessionCreateInput) {
  const prisma = getPrisma();
  const computer = await prisma.computer.findUnique({
    where: { id: computerId },
    include: {
      credential: { select: { passwordEnc: true } },
      screens: { where: { enabled: true }, orderBy: { index: "asc" } },
    },
  });
  if (!computer) throw new ApiError(404, "NOT_FOUND", "Equipo no encontrado");

  let targetPort = computer.vncPort;
  let screenId: string | null = null;
  let screenLabel: string | null = null;

  if (input.screen !== undefined && input.screen !== "desktop") {
    const screen = computer.screens.find((s) => s.index === input.screen);
    if (!screen) {
      throw new ApiError(422, "VALIDATION", `El equipo no tiene la pantalla ${input.screen} habilitada`);
    }
    targetPort = screen.port;
    screenId = screen.id;
    screenLabel = screen.label;
  }

  let passwordEnc = computer.credential?.passwordEnc ?? null;
  if (!passwordEnc) {
    const fallback = await prisma.vncCredential.findFirst({
      where: { isDefault: true },
      select: { passwordEnc: true },
    });
    passwordEnc = fallback?.passwordEnc ?? null;
  }

  return { computer, targetPort, screenId, screenLabel, passwordEnc };
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole("TECH", "ADMIN");
    const { id } = await ctx.params;
    const input = await parseBody(req, sessionCreateSchema);
    const prisma = getPrisma();

    const { computer, targetPort, screenId, screenLabel, passwordEnc } = await resolveTarget(id, input);

    const activeConflict = await prisma.remoteSession.findFirst({
      where: {
        computerId: id,
        status: "ACTIVE",
        NOT: { userId: user.id },
      },
      include: { user: { select: { name: true, username: true } } },
      orderBy: { startedAt: "asc" },
    });
    if (activeConflict && input.force !== true) {
      return jsonOk(
        {
          error: {
            code: "SESSION_IN_USE",
            message: `${activeConflict.user.name || activeConflict.user.username} está conectado a este equipo.`,
            details: {
              by: activeConflict.user.name || activeConflict.user.username,
              since: activeConflict.startedAt ?? activeConflict.createdAt,
            },
          },
        },
        409,
      );
    }

    const session = await prisma.remoteSession.create({
      data: {
        computerId: id,
        userId: user.id,
        mode: input.mode,
        reason: input.reason ?? null,
        targetPort,
        screenId,
        screenLabel,
        groupId: input.groupId ?? null,
        status: input.mode === "NATIVE" ? "ENDED" : "PENDING",
        endedAt: input.mode === "NATIVE" ? new Date() : null,
        endReason: input.mode === "NATIVE" ? "native_launch" : null,
      },
    });

    const ip = clientIp(req);
    await audit({
      userId: user.id,
      action: "session.start",
      entity: "RemoteSession",
      entityId: session.id,
      data: { computerId: id, hostname: computer.hostname, mode: input.mode, targetPort, screenLabel },
      ip,
    });

    if (input.mode === "NATIVE") {
      const host = computer.ip ?? computer.hostname;
      return jsonOk({
        sessionId: session.id,
        url: `tightvnc://${host}::${targetPort}`,
        host,
        targetPort,
      });
    }

    const token = await signGatewayToken({ sid: session.id }, gatewayJwtSecret(), 60);
    return jsonOk({
      sessionId: session.id,
      wsUrl: `/vnc-ws?token=${encodeURIComponent(token)}`,
      password: vncPasswordFor(passwordEnc),
      screenLabel,
      targetPort,
      hostname: computer.hostname,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
