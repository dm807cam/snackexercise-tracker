import { redirect } from "next/navigation";
import { getAppConfig } from "@/lib/app-config";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { today } = await getAppConfig();
  redirect(`/day/${today}`);
}
