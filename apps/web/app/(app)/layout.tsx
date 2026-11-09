import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getPrisma } from "@puestomap/db";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const prisma = getPrisma();
  const [lastOcsRun, lastProbe] = await Promise.all([
    prisma.syncRun.findFirst({
      where: { type: "OCS", status: { not: "RUNNING" } },
      orderBy: { finishedAt: "desc" },
      select: { finishedAt: true },
    }),
    prisma.computer.aggregate({
      _max: { lastProbeAt: true },
    }),
  ]);

  return (
    <div className="flex min-h-screen">
      <Sidebar role={session.user.role} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          user={{ name: session.user.name ?? session.user.username ?? "", role: session.user.role }}
          lastOcsSync={lastOcsRun?.finishedAt ?? null}
          lastProbe={lastProbe._max.lastProbeAt}
        />
        <main className="flex-1 p-4">{children}</main>
      </div>
    </div>
  );
}
