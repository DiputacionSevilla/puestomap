import { redirect } from "next/navigation";
import { getPrisma } from "@puestomap/db";
import { normalizeHostname, safeCallbackPath } from "@puestomap/shared";
import { auth } from "@/auth";
import { NotSynced } from "@/components/computers/not-synced";

export const dynamic = "force-dynamic";

export default async function GlpiNameLinkPage({ searchParams }: { searchParams: Promise<{ name?: string }> }) {
  const { name } = await searchParams;
  const session = await auth();
  if (!session?.user) {
    const back = safeCallbackPath(`/equipos/glpi?name=${encodeURIComponent(name ?? "")}`);
    redirect(`/login?callbackUrl=${encodeURIComponent(back)}`);
  }
  const hostname = name ? normalizeHostname(name).split(".")[0] : "";
  const computer = hostname
    ? await getPrisma().computer.findUnique({ where: { hostname }, select: { id: true } })
    : null;
  if (computer) redirect(`/equipos/${computer.id}`);
  return <NotSynced canSync={session.user.role !== "VIEWER"} />;
}
