import { redirect } from "next/navigation";
import { DeadLink, SignupForm } from "@/components/Auth/SignupForm";
import { needsSetup } from "@/lib/auth/accounts";
import { getCurrentUser } from "@/lib/auth/current";
import { registrationMode } from "@/lib/instance";

export const dynamic = "force-dynamic";

export default async function SignupPage() {
  if (await getCurrentUser()) redirect("/");
  if (await needsSetup()) redirect("/setup");
  if ((await registrationMode()) !== "open") {
    return (
      <DeadLink
        title="Invitation only"
        message="Accounts here are created by invitation. Ask the person who runs this instance for a link."
      />
    );
  }
  return <SignupForm />;
}
