import { redirect } from "next/navigation";
import { LoginForm } from "@/components/Auth/LoginForm";
import { needsSetup } from "@/lib/auth/accounts";
import { getCurrentUser, safeNextPath } from "@/lib/auth/current";
import { registrationMode } from "@/lib/instance";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const next = safeNextPath((await searchParams).next);
  if (await getCurrentUser()) redirect(next);
  if (await needsSetup()) redirect("/setup");
  return <LoginForm next={next} canSignUp={(await registrationMode()) === "open"} />;
}
