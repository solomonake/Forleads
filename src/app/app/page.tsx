import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function AppPage() {
  const session = await getSession();
  if (!session) redirect("/");
  return <AppShell />;
}
