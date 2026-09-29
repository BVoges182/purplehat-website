import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { Alert, AuthFrame, Button, Field, inputClass } from "../components/ui";

export default function Login() {
  const { user, ready, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const notice = location.state?.message || "";

  if (ready && user) return <Navigate to={user.role === "admin" ? "/admin" : "/"} replace />;

  async function onSubmit(event) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const signedIn = await login(email, password);
      const from = location.state?.from?.pathname || "";
      const next = signedIn.role === "admin"
        ? (from.startsWith("/admin") ? from : "/admin")
        : (from && from !== "/login" && !from.startsWith("/admin") ? from : "/");
      navigate(next, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthFrame title="Sign in" lede="Client dashboard for approved Purple Hat clients.">
      <form className="space-y-4" onSubmit={onSubmit}>
        {notice ? <Alert tone="ok">{notice}</Alert> : null}
        {error ? <Alert>{error}</Alert> : null}
        <Field label="Email">
          <input className={inputClass} type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </Field>
        <Field label="Password">
          <input className={inputClass} type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        </Field>
        <Button className="w-full" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</Button>
      </form>
      <p className="mt-6 text-sm text-mute">
        Have an invite key? <Link className="font-semibold text-plum" to="/register">Create an account</Link>
      </p>
    </AuthFrame>
  );
}
