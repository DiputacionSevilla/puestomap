import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getPrisma } from "@puestomap/db";
import { RfbMosaic, RfbViewer } from "@/components/remote/rfb-viewer";

export const dynamic = "force-dynamic";

export default async function RemotePage({
  params,
  searchParams,
}: {
  params: Promise<{ computerId: string }>;
  searchParams: Promise<{ screen?: string; screens?: string; layout?: string; group?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role === "VIEWER") redirect("/");
  const { computerId } = await params;
  const query = await searchParams;
  if (query.screens === "all" && query.layout === "tiles") {
    const screens = await getPrisma().computerScreen.findMany({
      where: { computerId, enabled: true },
      orderBy: { index: "asc" },
      select: { index: true, label: true },
    });
    return <RfbMosaic computerId={computerId} screens={screens} groupId={query.group ?? crypto.randomUUID()} />;
  }
  const parsed = Number(query.screen);
  const screen = Number.isInteger(parsed) && parsed >= 1 && parsed <= 4 ? parsed : "desktop";
  return <RfbViewer computerId={computerId} screen={screen} groupId={query.group} />;
}
