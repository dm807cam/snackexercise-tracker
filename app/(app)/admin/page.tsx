import { AdminView } from "@/components/Admin";
import { requireAdmin } from "@/lib/auth/current";

export const dynamic = "force-dynamic";

export const metadata = { title: "Administration" };

/** The instance console: accounts, invitations, sign-up, the audit log. Admins only; a 404 for anyone else. */
export default async function AdminPage() {
  const admin = await requireAdmin();
  return <AdminView currentUserId={admin.id} />;
}
