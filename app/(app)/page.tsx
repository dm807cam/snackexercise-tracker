import { redirect } from "next/navigation";
import { getAppConfig } from "@/lib/app-config";
import { requireUser } from "@/lib/auth/current";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await requireUser();
  const { today } = await getAppConfig(user.id);
  redirect(`/day/${today}`);
}
