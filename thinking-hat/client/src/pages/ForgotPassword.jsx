import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { Alert, AuthFrame, Button, Field, inputClass } from "../components/ui";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const data = await api.forgotPassword({ email });
      setMessage(data.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthFrame title="Forgot password" lede="Enter the email on your account." homeLink>
      {message ? (
        <div className="space-y-4">
          <Alert tone="ok">{message}</Alert>
          <Link className="inline-flex text-sm font-semibold text-plum" to="/login">Back to sign in</Link>
        </div>
      ) : (
        <form className="space-y-4" onSubmit={onSubmit}>
          {error ? <Alert>{error}</Alert> : null}
          <Field label="Email">
            <input className={inputClass} type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </Field>
          <Button className="w-full" type="submit" disabled={busy}>{busy ? "Sending…" : "Send reset link"}</Button>
        </form>
      )}
    </AuthFrame>
  );
}
