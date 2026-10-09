"use client";

import { useState } from "react";
import { useLive, useMeet } from "@/components/meet-context";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, Empty, Field, inputCls, Loading, PageHeader, Table, Td } from "@/components/ui";
import { supabase } from "@/lib/supabase/client";
import type { Profile, Role } from "@/lib/types";
import { createUser, deleteUser, resetPassword } from "./actions";

export default function UsersPage() {
  const { isAdmin, profile: me } = useMeet();
  const toast = useToast();
  const { data: users, loading, refresh } = useLive(
    async () => ((await supabase().from("profiles").select("*").order("created_at")).data as Profile[]) ?? [],
    [] as Profile[],
  );
  const [form, setForm] = useState({ email: "", password: "", fullName: "", role: "entry" as Role });
  const [busy, setBusy] = useState(false);

  if (loading) return <Loading />;
  if (!isAdmin) return <Empty>Only an administrator can manage users.</Empty>;

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await createUser(form);
    setBusy(false);
    if (res.error) return toast.error(res.error);
    toast.ok(`Account created for ${form.email}. Share the password with them.`);
    setForm({ email: "", password: "", fullName: "", role: "entry" });
    void refresh();
  };

  const setRole = async (u: Profile, role: Role) => {
    const { error } = await supabase().from("profiles").update({ role }).eq("id", u.id);
    if (error) toast.error(error);
    else toast.ok(`${u.email} is now ${role === "admin" ? "an admin" : "data entry"}.`);
    void refresh();
  };

  const newPassword = async (u: Profile) => {
    const pw = prompt(`New password for ${u.email} (min 8 characters):`);
    if (!pw) return;
    const res = await resetPassword(u.id, pw);
    if (res.error) toast.error(res.error);
    else toast.ok("Password changed.");
  };

  const remove = async (u: Profile) => {
    if (!confirm(`Remove ${u.email}? They will no longer be able to sign in.`)) return;
    const res = await deleteUser(u.id);
    if (res.error) toast.error(res.error);
    else toast.ok("User removed.");
    void refresh();
  };

  return (
    <>
      <PageHeader
        title="Users"
        description="Admins manage setup, bibs, users and backups. Data-entry users register athletes, relays and prizes."
      />
      <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        <Card>
          <h2 className="mb-3 font-bold">Add user</h2>
          <form onSubmit={create} className="space-y-3">
            <Field label="Name">
              <input className={inputCls} value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required />
            </Field>
            <Field label="Email (used to sign in)">
              <input type="email" className={inputCls} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            </Field>
            <Field label="Password" hint="At least 8 characters. Give it to the user in person.">
              <input className={inputCls} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={8} />
            </Field>
            <Field label="Role">
              <select className={inputCls} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
                <option value="entry">Data entry</option>
                <option value="admin">Admin</option>
              </select>
            </Field>
            <Button type="submit" variant="success" className="w-full" disabled={busy}>
              {busy ? "Creating…" : "Create user"}
            </Button>
          </form>
        </Card>
        <Card>
          <Table head={["Name", "Email", "Role", ""]}>
            {users.map((u) => (
              <tr key={u.id}>
                <Td className="font-semibold">
                  {u.full_name || "—"} {u.id === me.id && <Badge tone="blue">You</Badge>}
                </Td>
                <Td className="text-xs">{u.email}</Td>
                <Td>
                  <select
                    className={`${inputCls} py-1.5`}
                    value={u.role}
                    disabled={u.id === me.id}
                    onChange={(e) => setRole(u, e.target.value as Role)}
                  >
                    <option value="entry">Data entry</option>
                    <option value="admin">Admin</option>
                  </select>
                </Td>
                <Td className="whitespace-nowrap">
                  <Button size="sm" variant="outline" onClick={() => newPassword(u)}>
                    Reset password
                  </Button>{" "}
                  {u.id !== me.id && (
                    <Button size="sm" variant="ghost" className="text-red-600" onClick={() => remove(u)}>
                      Remove
                    </Button>
                  )}
                </Td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>
    </>
  );
}
