import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Profile } from "@/lib/types";

export async function serverSupabase() {
  const store = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (list) => {
          try {
            list.forEach(({ name, value, options }) => store.set(name, value, options));
          } catch {
            // Called from a Server Component; middleware refreshes the session instead.
          }
        },
      },
    },
  );
}

export async function getProfile(): Promise<Profile | null> {
  const sb = await serverSupabase();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return null;
  const { data } = await sb.from("profiles").select("*").eq("id", user.id).single();
  return (data as Profile | null) ?? null;
}
