import React, { useState } from 'react';
import {
  ArrowLeft,
  Mail,
  LoaderCircle,
  CheckCircle2,
  ShieldCheck
} from 'lucide-react';
import { api } from '../lib/api';
export default function ForgotPasswordPage({ onBack }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

 async function handleSubmit(e) {
  e.preventDefault();
  setBusy(true);
  setError('');
  try {
    await api('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email })
    });
    setSent(true);
  } catch (err) {
    // ✅ असली error console में दिखाओ
    console.error('Forgot password error:', err);
    console.error('Response:', err?.response);
    console.error('Status:', err?.response?.status);
    console.error('Data:', err?.response?.data);

    setError(
      err?.response?.data?.message || err?.message || 'Something went wrong.'
    );
  } finally {
    setBusy(false);
  }
}

  return (
    <main className="login-layout">
      <section className="login-card" aria-label="Forgot password">
        <header className="login-card-brand">
          <button type="button" className="login-link-button" onClick={onBack}>
            <ArrowLeft size={16} /> Back to login
          </button>
        </header>

        <div className="login-card-body">
          {sent ? (
            <div className="login-welcome">
              <CheckCircle2 size={40} style={{ color: '#16a34a' }} />
              <h1>Check your <span>Email</span></h1>
              <p>
                If <strong>{email}</strong> is registered, we've sent a reset link.
                It expires in 30 minutes.
              </p>
            </div>
          ) : (
            <>
              <div className="login-welcome">
                <span className="login-overline">ACCOUNT RECOVERY</span>
                <h1>Forgot <span>Password?</span></h1>
                <p>Enter your email and we'll send you a secure reset link.</p>
              </div>

              <form onSubmit={handleSubmit} className="login-form">
                <label htmlFor="forgot-email">Email address</label>
                <div className="input-wrap">
                  <Mail size={18} className="login-input-icon" aria-hidden="true" />
                  <input
                    id="forgot-email"
                    type="email"
                    autoComplete="username"
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>

                {error && <p className="login-error">{error}</p>}

                <button className="button button-primary login-submit" disabled={busy}>
                  {busy ? (
                    <>
                      <LoaderCircle size={17} className="spin" /> Sending…
                    </>
                  ) : (
                    <>Send Reset Link</>
                  )}
                </button>
              </form>
            </>
          )}

          <div className="secure-note">
            <ShieldCheck size={15} />
            Your reset link is single-use and expires automatically
          </div>
        </div>
      </section>
    </main>
  );
}