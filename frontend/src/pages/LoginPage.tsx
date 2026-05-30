import { FormEvent, useState } from "react";
import { apiLogin } from "../lib/api";

export function LoginPage({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await apiLogin(code);
      onLoggedIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={onSubmit}>
        <div className="brand-block">
          <div className="eyebrow">Private invite-only AI</div>
          <h1>Access ChatIOS</h1>
          <p>Enter your access code to continue. No public registration is available.</p>
        </div>
        <label className="field">
          <span>Access code</span>
          <input value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" placeholder="XXXX-XXXX-XXXX" />
        </label>
        {error ? <div className="error-banner">{error}</div> : null}
        <button className="primary-button" type="submit" disabled={loading}>
          {loading ? "Checking..." : "Enter"}
        </button>
      </form>
    </div>
  );
}
