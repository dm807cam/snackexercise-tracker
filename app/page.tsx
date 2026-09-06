import { redirect } from "next/navigation";
import { todayLocalDate } from "@/lib/dates";

export const dynamic = "force-dynamic";

export default function Home() {
  redirect(`/day/${todayLocalDate()}`);
}
