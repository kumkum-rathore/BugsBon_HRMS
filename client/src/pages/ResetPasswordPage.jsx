import React, { useState, useEffect } from 'react';
import {
  LockKeyhole,
  LoaderCircle,
  CheckCircle2,
  ShieldCheck
} from 'lucide-react';
import { PasswordInput } from '../components/common.jsx';
import { api } from '../lib/api';

export default function ResetPasswordPage() {
  const [token, setToken] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setToken(params.get('token') || '');
  }, []);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      return setError('Password must be at least 8 characters.');
    }
    if (password !== confirm) {
      return setError('Passwords do not match.');
    }

    setBusy(true);
    try {
      // ✅ सही तरीका — api एक function है, method options में दो
      await api('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, password })
      });
      setDone(true);
      setTimeout(() => {
        window.history.replaceState({}, '', '/');
        window.location.reload();
      }, 2500);
    } catch (err) {
      // ✅ असली error console में दिखाओ (debugging के लिए)
      console.error('Reset password error:', err);
      console.error('Status:', err?.response?.status);
      console.error('Data:', err?.response?.data);

      setError(
        err?.response?.data?.message ||
        err?.message ||
        'Reset failed. Please try again.'
      );
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <main className="login-layout">
        <section className="login-card">
          <div className="login-card-body login-welcome">
            <h1>Invalid <span>Link</span></h1>
            <p>This reset link is missing a token. Please request a new one.</p>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="login-layout">
      <section className="login-card" aria-label="Reset password">
        <div className="login-card-body">
          {done ? (
            <div className="login-welcome">
              <CheckCircle2 size={40} style={{ color: '#16a34a' }} />
              <h1>Password <span>Updated</span></h1>
              <p>Redirecting you to login…</p>
            </div>
          ) : (
            <>
              <div className="login-welcome">
                <span className="login-overline">SET NEW PASSWORD</span>
                <h1>Choose a <span>New Password</span></h1>
                <p>Use at least 8 characters. Avoid reusing old passwords.</p>
              </div>

              <form onSubmit={handleSubmit} className="login-form">
                <label htmlFor="new-password">New password</label>
                <div className="input-wrap">
                  <LockKeyhole size={18} className="login-input-icon" aria-hidden="true" />
                  <PasswordInput
                    id="new-password"
                    autoComplete="new-password"
                    placeholder="Enter new password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>

                <label htmlFor="confirm-password">Confirm password</label>
                <div className="input-wrap">
                  <LockKeyhole size={18} className="login-input-icon" aria-hidden="true" />
                  <PasswordInput
                    id="confirm-password"
                    autoComplete="new-password"
                    placeholder="Re-enter password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                  />
                </div>

                {error && <p className="login-error">{error}</p>}

                <button className="button button-primary login-submit" disabled={busy}>
                  {busy ? (
                    <>
                      <LoaderCircle size={17} className="spin" /> Updating…
                    </>
                  ) : (
                    'Update Password'
                  )}
                </button>
              </form>
            </>
          )}

          <div className="secure-note">
            <ShieldCheck size={15} />
            Link is single-use and expires automatically
          </div>
        </div>
      </section>
    </main>
  );
}