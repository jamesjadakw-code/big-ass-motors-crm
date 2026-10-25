import { useState } from 'react';
import { loginWithGoogle, loginWithPassword } from '../localEngine.js';
import logo from '../assets/Logos/bam-login-logo.jpg';

// Mirrors the domain CRM log-in page (inventory/login.php) exactly, in BAM yellow.
export default function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [refused, setRefused] = useState('');

  async function submit(e) {
    e.preventDefault();
    setErr(''); setRefused('');
    try { onLogin(await loginWithPassword(email, password)); }
    catch (ex) { setErr(ex.message || 'Wrong e-mail or password.'); }
  }

  function google() {
    setErr(''); setRefused('');
    if (!email.trim()) { setErr('Enter your Google e-mail above, then click Continue with Google.'); return; }
    try { onLogin(loginWithGoogle(email)); }
    catch (ex) { if (ex.refusedEmail) setRefused(ex.refusedEmail); else setErr(ex.message); }
  }

  const input = 'h-[38px] w-full rounded-md border border-[#1f1f1f] bg-[#0a0a0a] px-3 text-[13.5px] text-white outline-none focus:border-[#FFC107] focus:shadow-[0_0_0_1px_#FFC107]';
  const label = 'mb-1 block text-[11px] font-bold uppercase tracking-[0.06em] text-[#9a9aa3]';

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-black p-4 font-['Inter',sans-serif] text-neutral-100">
      <form onSubmit={submit} autoComplete="on" className="w-full max-w-[380px] rounded-[14px] border border-[#1f1f1f] bg-black px-6 pb-[26px] pt-6 shadow-[0_20px_50px_rgba(0,0,0,0.95)]">
        <img src={logo} alt="Big Ass Motors" className="mx-auto mb-3 block w-[150px] max-w-full rounded-md" />
        <div className="text-center text-[15px] font-bold tracking-[0.02em] text-white">BIG ASS MOTORS · CRM</div>
        <div className="mx-auto mb-3.5 mt-2 max-w-[300px] rounded-md border border-[#FFC107]/40 bg-[#FFC107]/[.12] px-2 py-1 text-center text-[11px] font-bold tracking-[0.03em] text-[#FFC107]">
          YOU CAN&apos;T DEPOSIT EXCUSES
        </div>

        {refused && (
          <div className="mb-3 rounded-md border border-[#FFC107] bg-[#FFC107]/10 p-2.5 text-xs leading-relaxed text-[#ffe08a]">
            <b>We couldn&apos;t sign you in with Google.</b><br />
            The Google account <b>{refused}</b> isn&apos;t on the Big Ass Motors CRM access list. If you work with us, ask James to add this e-mail address for you — or log in below with your e-mail and password. Thank you!
          </div>
        )}
        {err && <div className="mb-3 rounded-md border border-red-500 bg-red-500/10 p-2.5 text-xs text-red-300">{err}</div>}

        <button type="button" onClick={google} className="flex h-[40px] w-full items-center justify-center gap-2.5 rounded-md border border-[#1f1f1f] bg-[#0a0a0a] text-[13.5px] font-semibold text-white hover:border-[#FFC107]">
          <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" /><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" /><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" /><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" /></svg>
          Continue with Google
        </button>
        <div className="mt-1.5 text-center text-[11px] leading-tight text-[#9a9aa3]">Signs you into BAM CRM and links this Gmail inbox for mail from the desk.</div>

        <div className="my-2.5 flex items-center gap-2.5 text-[11px] tracking-[0.06em] text-[#9a9aa3] before:h-px before:flex-1 before:bg-[#222222] after:h-px after:flex-1 after:bg-[#222222]">OR</div>

        <div className="mb-2.5"><label className={label}>E-mail</label><input type="email" required autoFocus autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className={input} /></div>
        <div className="mb-2.5"><label className={label}>Password</label><input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={input} /></div>
        <button type="submit" className="mt-1 h-[40px] w-full rounded-md border border-[#FFC107] bg-[#FFC107] text-[14px] font-bold text-black hover:brightness-105">Log in</button>
        <a href="https://www.bigassmotors.com" className="mt-3 block text-center text-[12px] text-[#FFC107] underline">← bigassmotors.com</a>
      </form>
    </div>
  );
}
