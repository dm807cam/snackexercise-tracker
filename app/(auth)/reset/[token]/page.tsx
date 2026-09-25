import { DeadLink } from "@/components/Auth/SignupForm";
import { ResetForm } from "@/components/Auth/ResetForm";
import { peekLink } from "@/lib/auth/links";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await peekLink(token, "reset");
  const user = link?.userId
    ? await prisma.user.findUnique({ where: { id: link.userId }, select: { email: true, disabledAt: true } })
    : null;
  if (!link || !user || user.disabledAt) {
    return (
      <DeadLink
        title="This reset link has run out"
        message="It has expired or was already used. Ask your administrator for a new one."
      />
    );
  }
  return <ResetForm token={token} email={user.email} />;
}
