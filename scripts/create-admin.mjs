// Creates (or promotes) an admin account.
// Usage: npm run create-admin -- <email> <password> "<Full Name>"
import { createClient } from "@supabase/supabase-js";

const [email, password, fullName = ""] = process.argv.slice(2);
if (!email || !password) {
  console.error('Usage: npm run create-admin -- <email> <password> "<Full Name>"');
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (see .env.local).");
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

let userId;
const created = await sb.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { full_name: fullName },
});
if (created.error) {
  // Already exists: find the user and promote them instead.
  const { data, error } = await sb.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const existing = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!existing) {
    console.error(created.error.message);
    process.exit(1);
  }
  userId = existing.id;
} else {
  userId = created.data.user.id;
}

const { error } = await sb.from("profiles").update({ role: "admin", full_name: fullName }).eq("id", userId);
if (error) throw error;
console.log(`✓ ${email} is an admin.`);
