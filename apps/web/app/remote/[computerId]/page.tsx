import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { RfbViewer } from "@/components/remote/rfb-viewer";

export const dynamic = "force-dynamic";

export default async function RemotePage({
  params,
}: {
  params: Promise<{ computerId: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role === "VIEWER") redirect("/");
  const { computerId } = await params;
  return <RfbViewer computerId={computerId} />;
}
