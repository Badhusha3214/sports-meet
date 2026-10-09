import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { MeetProvider } from "@/components/meet-context";
import { Shell } from "@/components/shell";
import { getProfile } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const profile = await getProfile();
  if (!profile) redirect("/login?e=noprofile");
  return (
    <MeetProvider profile={profile}>
      <Shell>{children}</Shell>
    </MeetProvider>
  );
}
