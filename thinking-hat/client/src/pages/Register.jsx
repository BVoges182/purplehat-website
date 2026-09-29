import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { Alert, AuthFrame, Button, Field, inputClass } from "../components/ui";

const empty = {
  inviteCode: "",
  name: "",
  email: "",
  businessName: "",
  phone: "",
  password: "",
  confirm: "",
};

export default function Register() {
  const { user, ready } = useAuth();
  const [form, setForm] = useState(empty);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  if (ready && user) return <Navigate to={user.role === "admin" ? "/admin" : "/"} replace />;

  function set(key) {
    return (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  }

  async function onSubmit(event) {
    event.preventDefault();
    setError("");
    if (form.password !== form.confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const data = await api.register({
        inviteCode: form.inviteCode,
        name: form.name,
        email: form.email,
        businessName: form.businessName,
        phone: form.phone,
        password: form.password,
      });
      setMessage(data.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (message) {
    return (
      <AuthFrame title="Account created" lede={message}>
        <Link className="inline-flex min-h-11 items-center justify-center rounded-full bg-gradient-to-b from-[#8b5cf6] to-[#6d28d9] px-5 font-display text-sm font-extrabold text-white" to="/login" state={{ message }}>
          Go to sign in
        </Link>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame title="Create an account" lede="Enter the invite key Purple Hat emailed you. Open registration is closed.">
      <form className="space-y-4" onSubmit={onSubmit}>
        {error ? <Alert>{error}</Alert> : null}
        <Field label="Invite key" hint="The key looks like TH-XXXX-XXXX.">
          <input className={`${inputClass} font-mono tracking-wide`} autoComplete="off" spellCheck="false" value={form.inviteCode} onChange={set("inviteCode")} required />
        </Field>
        <Field label="Your name">
          <input className={inputClass} autoComplete="name" value={form.name} onChange={set("name")} required />
        </Field>
        <Field label="Business name">
          <input className={inputClass} value={form.businessName} onChange={set("businessName")} required />
        </Field>
        <Field label="Email">
          <input className={inputClass} type="email" autoComplete="email" value={form.email} onChange={set("email")} required />
        </Field>
        <Field label="Phone">
          <input className={inputClass} autoComplete="tel" value={form.phone} onChange={set("phone")} />
        </Field>
        <Field label="Password" hint="At least 8 characters.">
          <input className={inputClass} type="password" autoComplete="new-password" value={form.password} onChange={set("password")} required />
        </Field>
        <Field label="Confirm password">
          <input className={inputClass} type="password" autoComplete="new-password" value={form.confirm} onChange={set("confirm")} required />
        </Field>
        <Button className="w-full" type="submit" disabled={busy}>{busy ? "Creating…" : "Create account"}</Button>
      </form>
      <p className="mt-6 text-sm text-mute">
        Already registered? <Link className="font-semibold text-plum" to="/login">Sign in</Link>
      </p>
    </AuthFrame>
  );
}
