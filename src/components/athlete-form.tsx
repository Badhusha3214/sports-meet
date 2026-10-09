"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMeet } from "@/components/meet-context";
import { useToast } from "@/components/toast";
import { Button, Field, inputCls, Modal, Note } from "@/components/ui";
import { supabase } from "@/lib/supabase/client";
import type { Athlete, Gender } from "@/lib/types";
import { defaultCategory, eligibleCategories, fmtDate } from "@/lib/util";

/** Shrinks an image to at most `max` px on its longest side and returns a JPEG blob. */
async function resizeImage(file: File, max = 480): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not process photo."))), "image/jpeg", 0.85),
  );
}

export function AthleteForm({
  open,
  athlete,
  eventIds,
  onClose,
  onSaved,
}: {
  open: boolean;
  athlete: Athlete | null;
  eventIds: number[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { schools, categories, events } = useMeet();
  const toast = useToast();
  const [name, setName] = useState("");
  const [schoolId, setSchoolId] = useState("");
  const [gender, setGender] = useState<Gender | "">("");
  const [dob, setDob] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const [photo, setPhoto] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  // Reset only when the dialog opens or switches athlete, not on every live data refresh.
  const initialEvents = useRef(eventIds);
  initialEvents.current = eventIds;
  useEffect(() => {
    if (!open) return;
    setName(athlete?.name ?? "");
    setSchoolId(athlete ? String(athlete.school_id) : "");
    setGender(athlete?.gender ?? "");
    setDob(athlete?.dob ?? "");
    setCategoryId(athlete ? String(athlete.category_id) : "");
    setSelected(initialEvents.current);
    setPhoto(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, athlete?.id]);

  const eligible = useMemo(() => eligibleCategories(categories, gender, dob), [categories, gender, dob]);

  // Pick the youngest eligible category automatically when gender/DOB change.
  const onIdentityChange = (g: Gender | "", d: string) => {
    setGender(g);
    setDob(d);
    const current = categories.find((c) => String(c.id) === categoryId);
    const stillOk = current && eligibleCategories(categories, g, d).some((c) => c.id === current.id);
    if (!stillOk) {
      const def = defaultCategory(categories, g, d);
      setCategoryId(def ? String(def.id) : "");
      setSelected([]);
    }
  };

  const categoryEvents = events.filter((e) => String(e.category_id) === categoryId && e.kind !== "relay");
  const hasRelay = events.some((e) => String(e.category_id) === categoryId && e.kind === "relay");

  const toggle = (id: number) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryId) return toast.error("No eligible category for this gender and date of birth.");
    setSaving(true);
    const sb = supabase();
    try {
      const row = {
        name: name.trim(),
        school_id: Number(schoolId),
        gender: gender as Gender,
        dob,
        category_id: Number(categoryId),
      };
      let id = athlete?.id;
      if (id) {
        const { error } = await sb.from("athletes").update(row).eq("id", id);
        if (error) throw error;
      } else {
        const { data, error } = await sb.from("athletes").insert(row).select("id").single();
        if (error) throw error;
        id = data.id as number;
      }

      // Sync event entries. A category change already removed old entries in the database.
      const keep = selected.filter((x) => categoryEvents.some((ev) => ev.id === x));
      const before = athlete && String(athlete.category_id) === categoryId ? eventIds : [];
      const removed = before.filter((x) => !keep.includes(x));
      const added = keep.filter((x) => !before.includes(x));
      if (removed.length) {
        const { error } = await sb.from("entries").delete().eq("athlete_id", id).in("event_id", removed);
        if (error) throw error;
      }
      if (added.length) {
        const { error } = await sb.from("entries").insert(added.map((event_id) => ({ athlete_id: id, event_id })));
        if (error) throw error;
      }

      if (photo) {
        const blob = await resizeImage(photo);
        const path = `athletes/${id}-${Date.now()}.jpg`;
        const up = await sb.storage.from("photos").upload(path, blob, { contentType: "image/jpeg" });
        if (up.error) throw up.error;
        if (athlete?.photo_path) await sb.storage.from("photos").remove([athlete.photo_path]);
        const { error } = await sb.from("athletes").update({ photo_path: path }).eq("id", id);
        if (error) throw error;
      }

      toast.ok(athlete ? "Athlete updated." : `${row.name} registered.`);
      onSaved();
      if (athlete) onClose();
      else {
        // Keep school/gender for fast entry of the next athlete from the same school.
        setName("");
        setDob("");
        setCategoryId("");
        setSelected([]);
        setPhoto(null);
      }
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} title={athlete ? `Edit ${athlete.name}` : "Register athlete"} onClose={onClose} wide>
      <form onSubmit={save} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Athlete name *">
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          </Field>
          <Field label="School *">
            <select className={inputCls} value={schoolId} onChange={(e) => setSchoolId(e.target.value)} required>
              <option value="">Select school</option>
              {schools.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Gender *">
            <select
              className={inputCls}
              value={gender}
              onChange={(e) => onIdentityChange(e.target.value as Gender | "", dob)}
              required
            >
              <option value="">Select</option>
              <option>Girls</option>
              <option>Boys</option>
            </select>
          </Field>
          <Field label="Date of birth *">
            <input
              type="date"
              className={inputCls}
              value={dob}
              onChange={(e) => onIdentityChange(gender, e.target.value)}
              required
            />
          </Field>
          <Field
            label="Category *"
            hint={gender && dob && !eligible.length ? "No category accepts this gender and date of birth." : "Auto-selected from DOB. You may move an athlete up."}
          >
            <select
              className={inputCls}
              value={categoryId}
              onChange={(e) => {
                setCategoryId(e.target.value);
                setSelected([]);
              }}
              required
            >
              <option value="">{gender && dob ? "Select category" : "Enter gender and DOB first"}</option>
              {eligible.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} (born on/after {fmtDate(c.dob_from)})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Photo (optional)">
            <input
              type="file"
              accept="image/*"
              className={inputCls}
              onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
            />
          </Field>
        </div>

        {categoryId && (
          <div>
            <div className="mb-2 text-sm font-semibold text-slate-700">Events</div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {categoryEvents.map((ev) => (
                <label
                  key={ev.id}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm has-[:checked]:border-blue-600 has-[:checked]:bg-blue-50"
                >
                  <input type="checkbox" checked={selected.includes(ev.id)} onChange={() => toggle(ev.id)} />
                  {ev.name}
                </label>
              ))}
            </div>
            {hasRelay && <p className="mt-2 text-xs text-slate-500">Relays are set up as teams on the Relay Teams page.</p>}
          </div>
        )}

        {athlete && String(athlete.category_id) !== categoryId && (
          <Note>Changing category removes this athlete&apos;s old events, relay places and their results.</Note>
        )}

        <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button type="submit" variant="success" disabled={saving}>
            {saving ? "Saving…" : athlete ? "Save changes" : "Save & add next"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
