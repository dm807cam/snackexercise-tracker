import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/current";
import { prisma } from "@/lib/db";
import { snackView } from "@/lib/snack/service";
import { SnackDeepLink } from "@/components/Snack/SnackDeepLink";

export const dynamic = "force-dynamic";

/**
 * Where a nudge's "Start" lands: straight into the player for the snack the
 * notification proposed. A snack that is already finished, or someone else's,
 * is not found.
 */
export default async function SnackPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const row = await prisma.snack.findFirst({ where: { id, userId: user.id } });
  if (!row) notFound();

  let snack;
  try {
    snack = snackView(row);
  } catch {
    notFound();
  }
  return <SnackDeepLink snack={JSON.parse(JSON.stringify(snack))} closed={!["proposed", "started"].includes(row.status)} />;
}
