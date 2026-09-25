import { redirect } from "next/navigation";
import { SetupForm } from "@/components/Auth/SetupForm";
import { LEGACY_OWNER_ID, needsSetup } from "@/lib/auth/accounts";
import { config } from "@/lib/config";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * First run: create the administrator — or, on a database that predates
 * accounts, claim the log already in it.
 */
export default async function SetupPage() {
  if (!(await needsSetup())) redirect("/login");
  const legacy = await prisma.user.findUnique({
    where: { id: LEGACY_OWNER_ID },
    select: { passwordHash: true, _count: { select: { entries: true } } },
  });
  return (
    <SetupForm
      tokenRequired={config.setupToken !== null}
      existingEntries={legacy && legacy.passwordHash === null ? legacy._count.entries : 0}
    />
  );
}
