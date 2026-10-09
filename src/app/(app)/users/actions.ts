"use server";

import { createClient } from "@supabase/supabase-js";
import { getProfile } from "@/lib/supabase/server";
import type { Role } from "@/lib/types";

type ActionResult = { error?: string };

/** Service-role client. Server-only: the key never reaches the browser. */
function adminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set on the server.");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function asAdmin<T>(fn: (me: string) => Promise<T>): Promise<T | ActionResult> {
  const me = await getProfile();
  if (me?.role !== "admin") return { error: "Only an admin can manage users." };
  try {
    return await fn(me.id);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Something went wrong." };
  }
}

export async function createUser(input: { email: string; password: string; fullName: string; role: Role }): Promise<ActionResult> {
  return asAdmin(async () => {
    if (input.password.length < 8) return { error: "Password must be at least 8 characters." };
    const sb = adminClient();
    const { data, error } = await sb.auth.admin.createUser({
      email: input.email.trim(),
      password: input.password,
      email_confirm: true,
      user_metadata: { full_name: input.fullName.trim() },
    });
    if (error) return { error: error.message };
    const res = await sb.from("profiles").update({ role: input.role, full_name: input.fullName.trim() }).eq("id", data.user.id);
    if (res.error) return { error: res.error.message };
    return {};
  });
}

export async function resetPassword(userId: string, password: string): Promise<ActionResult> {
  return asAdmin(async () => {
    if (password.length < 8) return { error: "Password must be at least 8 characters." };
    const { error } = await adminClient().auth.admin.updateUserById(userId, { password });
    return error ? { error: error.message } : {};
  });
}

export async function deleteUser(userId: string): Promise<ActionResult> {
  return asAdmin(async (me) => {
    if (userId === me) return { error: "You can't delete your own account." };
    const { error } = await adminClient().auth.admin.deleteUser(userId);
    return error ? { error: error.message } : {};
  });
}
