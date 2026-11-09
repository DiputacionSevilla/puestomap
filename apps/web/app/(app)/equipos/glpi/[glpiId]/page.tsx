import { redirect } from "next/navigation";
import { getPrisma } from "@puestomap/db";
import { auth } from "@/auth";
import { NotSynced } from "@/components/computers/not-synced";

export const dynamic = "force-dynamic";

export default async function GlpiLinkPage({ params }: { params: Promise<{ glpiId: string }> }) {
  const { glpiId } = await params;
  const session = await auth();
  if (!session?.user) redirect(`/login?callbackUrl=${encodeURIComponent(`/equipos/glpi/${glpiId}`)}`);
  const id = Number(glpiId);
  const computer = Number.isInteger(id) && id > 0
    ? await getPrisma().computer.findUnique({ where: { glpiId: id }, select: { id: true } })
    : null;
  if (computer) redirect(`/equipos/${computer.id}`);
  return <NotSynced canSync={session.user.role !== "VIEWER"} />;
}
