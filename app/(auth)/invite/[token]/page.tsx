import { redirect } from "next/navigation";
import { DeadLink, SignupForm } from "@/components/Auth/SignupForm";
import { getCurrentUser } from "@/lib/auth/current";
import { peekLink } from "@/lib/auth/links";

export const dynamic = "force-dynamic";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  if (await getCurrentUser()) redirect("/");
  const { token } = await params;
  const link = await peekLink(token, "invite");
  if (!link) {
    return (
      <DeadLink
        title="This invitation has run out"
        message="It has expired or was already used. Ask for a new one."
      />
    );
  }
  return <SignupForm invite={token} lockedEmail={link.email} />;
}
