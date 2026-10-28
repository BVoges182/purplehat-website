import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { Alert, AuthFrame, Button, Field, inputClass } from "../components/ui";

const invalidCopy = "This reset link is invalid or has expired.";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token") || "";
  const [status, setStatus] = useState(token ? "checking" : "invalid");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return undefined;
    let stop = false;
    api.resetPasswordStatus(token)
      .then(() => { if (!stop) setStatus("ready"); })
      .catch(() => { if (!stop) setStatus("invalid"); });
    return () => { stop = true; };
  }, [token]);

  async function onSubmit(event) {
    event.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const data = await api.resetPassword({ token, password, confirm });
      navigate("/login", { replace: true, state: { message: data.message } });
    } catch (err) {
      if (err.message === invalidCopy) setStatus("invalid");
      else setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthFrame title="Choose a new password" lede="Use at least 8 characters." homeLink>
      {status === "checking" ? <p className="text-sm text-mute">Checking the link…</p> : null}
      {status === "invalid" ? (
        <div className="space-y-4">
          <Alert>{invalidCopy}</Alert>
          <Link className="inline-flex min-h-11 items-center justify-center rounded-full bg-gradient-to-b from-[#8b5cf6] to-[#6d28d9] px-5 font-display text-sm font-extrabold text-white" to="/forgot-password">
            Request a new link
          </Link>
        </div>
      ) : null}
      {status === "ready" ? (
        <form className="space-y-4" onSubmit={onSubmit}>
          {error ? <Alert>{error}</Alert> : null}
          <Field label="New password" hint="At least 8 characters.">
            <input className={inputClass} type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          </Field>
          <Field label="Confirm password">
            <input className={inputClass} type="password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} required />
          </Field>
          <Button className="w-full" type="submit" disabled={busy}>{busy ? "Saving…" : "Update password"}</Button>
        </form>
      ) : null}
    </AuthFrame>
  );
}
