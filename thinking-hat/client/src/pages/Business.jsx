import { useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import { Alert, Button, Card, Field, PageIntro, inputClass } from "../components/ui";

export default function Business() {
  const { user, setUser } = useAuth();
  const [form, setForm] = useState({
    name: user.name,
    businessName: user.businessName,
    phone: user.phone,
  });
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(user.photoUrl);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  function set(key) {
    return (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  }

  function onFile(event) {
    const next = event.target.files?.[0];
    setFile(next || null);
    setError("");
    if (!next) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(next.type)) {
      setError("Use a JPG, PNG, or WebP photo.");
      setFile(null);
      return;
    }
    if (next.size > 2 * 1024 * 1024) {
      setError("Use a photo under 2 MB.");
      setFile(null);
      return;
    }
    setPreview(URL.createObjectURL(next));
  }

  async function onSubmit(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    setBusy(true);
    try {
      const saved = await api.updateMe(form);
      setUser(saved.user);
      if (file) {
        const photo = await api.uploadPhoto(file);
        setUser(photo.user);
        setPreview(photo.user.photoUrl);
        setFile(null);
      }
      setMessage("Saved.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageIntro title="Business" lede="Your business photo and contact details, kept on the account." />
      <Card className="max-w-2xl">
        <form className="space-y-4" onSubmit={onSubmit}>
          {error ? <Alert>{error}</Alert> : null}
          {message ? <Alert tone="ok">{message}</Alert> : null}
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            {preview ? (
              <img src={preview} alt="" className="h-28 w-28 rounded-3xl object-cover" />
            ) : (
              <div className="grid h-28 w-28 place-items-center rounded-3xl bg-[#f5f0ff] font-display text-3xl font-extrabold text-plum">
                {(form.businessName || form.name || "?").slice(0, 1).toUpperCase()}
              </div>
            )}
            <Field label="Business photo" hint="JPG, PNG, or WebP. Under 2 MB.">
              <input className="block text-sm" type="file" accept="image/jpeg,image/png,image/webp" onChange={onFile} />
            </Field>
          </div>
          <Field label="Your name">
            <input className={inputClass} value={form.name} onChange={set("name")} required />
          </Field>
          <Field label="Business name">
            <input className={inputClass} value={form.businessName} onChange={set("businessName")} required />
          </Field>
          <Field label="Phone">
            <input className={inputClass} value={form.phone} onChange={set("phone")} />
          </Field>
          <Field label="Email" hint="Ask Purple Hat to change the sign-in email.">
            <input className={inputClass} value={user.email} disabled />
          </Field>
          <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
        </form>
      </Card>
    </div>
  );
}
