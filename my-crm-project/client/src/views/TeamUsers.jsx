import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { Badge, Empty } from '../ui.jsx';

export default function TeamUsers({ notify }) {
  const [tab, setTab] = useState('users'); // 'users' | 'team' | 'drafts' | 'audit'
  const [users, setUsers] = useState([]);
  const [leads, setLeads] = useState([]);
  const [drafts, setDrafts] = useState([]);
  const [audit, setAudit] = useState([]);
  const [newUser, setNewUser] = useState({ name: '', email: '', role: 'sales', google_allowed: true, password: '' });

  const loadAll = useCallback(async () => {
    const [u, l, d, a] = await Promise.all([
      api.users(),
      api.leads({}),
      api.emailDrafts(),
      api.auditLog(),
    ]);
    setUsers(u);
    setLeads(l);
    setDrafts(d);
    setAudit(a);
  }, []);

  useEffect(() => {
    loadAll().catch((e) => notify(e.message, true));
  }, [loadAll, notify]);

  async function handleAddUser(e) {
    e.preventDefault();
    if (newUser.password && newUser.password.length < 10) { notify('Use at least 10 characters for a password, or leave it blank for Google sign-in only', true); return; }
    try {
      await api.saveUser(newUser);
      setNewUser({ name: '', email: '', role: 'sales', google_allowed: true, password: '' });
      notify('User saved to MySQL users table');
      loadAll();
    } catch (ex) {
      notify(ex.message, true);
    }
  }

  async function toggleUserFlag(u, field) {
    await api.saveUser({ ...u, [field]: !u[field] });
    notify(`Updated ${u.name}`);
    loadAll();
  }

  async function changeRole(u, role) {
    await api.saveUser({ ...u, role });
    notify(`${u.name} role set to ${role.toUpperCase()}`);
    loadAll();
  }

  async function assignOwner(leadId, userId) {
    await api.assignLeadOwner(leadId, Number(userId));
    notify('Lead owner updated in tw_assign');
    loadAll();
  }

  return (
    <div className="d-page d-stack mx-auto max-w-6xl">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="h-display text-4xl font-bold">Users, Team &amp; Audit</h1>
          <p className="text-sm text-ink-400">
            Hostinger MySQL PDO tables: <code>users</code> · <code>tw_assign</code> · <code>email_drafts</code> · <code>crm_audit</code>
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[
            ['users', `Users (${users.length})`],
            ['team', `Team Lead Ownership (${leads.length})`],
            ['drafts', `MySQL Email Drafts (${drafts.length})`],
            ['audit', `CRM Audit Log (${audit.length})`],
          ].map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`rounded-lg px-3.5 py-2 text-xs font-bold uppercase tracking-wider ${
                tab === k ? 'bg-bam text-black' : 'bg-ink-800 text-neutral-300 hover:bg-ink-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      {tab === 'users' && (
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="card space-y-3 p-5 lg:col-span-2">
            <div className="text-xs font-bold uppercase tracking-widest text-ink-400">
              Active CRM Users (<code>users.php</code> · Access List for <code>login.php</code>)
            </div>
            <div className="divide-y divide-ink-800">
              {users.map((u) => (
                <div key={u.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <div className="font-semibold text-white">
                      {u.name} <span className="text-xs text-ink-400">({u.email})</span>
                    </div>
                    <div className="mt-0.5 text-xs text-ink-400">
                      Last login: {u.last_login_at ? new Date(u.last_login_at).toLocaleString() : 'Never'}
                      {u.last_login_via ? ` via ${u.last_login_via}` : ''}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      className="input !w-auto !py-1 text-xs"
                      value={u.role}
                      onChange={(e) => changeRole(u, e.target.value)}
                    >
                      <option value="admin">Admin (All Access)</option>
                      <option value="sales">Sales (Own Leads Only)</option>
                      <option value="broker">Broker (No Exports/Settings)</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => toggleUserFlag(u, 'google_allowed')}
                      className={`rounded px-2.5 py-1 text-xs font-semibold ${
                        u.google_allowed ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-ink-800 text-ink-400'
                      }`}
                    >
                      {u.google_allowed ? '✓ Google Allowed' : 'Google Off'}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleUserFlag(u, 'active')}
                      className={`rounded px-2.5 py-1 text-xs font-semibold ${
                        u.active ? 'bg-bam/20 text-bam border border-bam/40' : 'bg-red-500/20 text-red-300'
                      }`}
                    >
                      {u.active ? 'Active' : 'Disabled'}
                    </button>
                    {u.email !== 'sales@bigassmotors.com' && (
                      <button
                        type="button"
                        onClick={async () => {
                          if (!window.confirm(`Delete user ${u.name} (${u.email})?`)) return;
                          await api.deleteUser(u.id);
                          notify(`Deleted ${u.name}`);
                          loadAll();
                        }}
                        className="rounded border border-red-500/40 bg-red-500/15 px-2.5 py-1 text-xs font-semibold text-red-300 hover:bg-red-500/30"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <form onSubmit={handleAddUser} className="card space-y-3 p-5">
            <div className="text-xs font-bold uppercase tracking-widest text-ink-400">Add Team Member</div>
            <div>
              <label className="label">Name</label>
              <input className="input" required value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} placeholder="e.g. Carlos" />
            </div>
            <div>
              <label className="label">E-mail (Google Access List)</label>
              <input className="input" type="email" required value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} placeholder="carlos@bigassmotors.com" />
            </div>
            <div>
              <label className="label">Role</label>
              <select className="input" value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}>
                <option value="admin">Admin — James: everything</option>
                <option value="sales">Sales — Assigned leads only</option>
                <option value="broker">Broker — All leads, no bulk exports</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="new-user-password">Password (optional · 10+ characters · blank = Google sign-in only)</label>
              <input id="new-user-password" className="input" type="password" autoComplete="new-password" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} />
            </div>
            <label className="flex items-center gap-2 text-xs text-neutral-300">
              <input type="checkbox" checked={newUser.google_allowed} onChange={(e) => setNewUser({ ...newUser, google_allowed: e.target.checked })} />
              Allow Google Sign-In on <code>inventory/login.php</code>
            </label>
            <button type="submit" className="btn-primary w-full justify-center">+ Add to MySQL Users</button>
          </form>
        </div>
      )}

      {tab === 'team' && (
        <div className="card p-5">
          <div className="mb-3 text-xs font-bold uppercase tracking-widest text-ink-400">
            Team Settings &amp; Lead Ownership (<code>team_settings.php</code> · <code>tw_assign</code>) — Sales reps only see leads assigned to them
          </div>
          <div className="divide-y divide-ink-800">
            {leads.map((l) => (
              <div key={l.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <div>
                  <div className="font-semibold">{l.firstName} {l.lastName} <span className="text-xs text-ink-400">· {l.company}</span></div>
                  <div className="text-xs text-ink-400">{[l.wants?.make, l.wants?.model, l.wants?.category].filter(Boolean).join(' · ') || 'General Inquiry'}</div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge value={l.stage} />
                  <select
                    className="input !w-auto !py-1 text-xs"
                    value={l.ownerId || 1}
                    onChange={(e) => assignOwner(l.id, e.target.value)}
                  >
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'drafts' && (
        <div className="card p-5">
          <div className="mb-3 text-xs font-bold uppercase tracking-widest text-ink-400">
            MySQL <code>email_drafts</code> Outbox (<code>outbox.php</code>) — Buyer-Safe Pitches Queued for Review
          </div>
          {!drafts.length ? <Empty>No email drafts queued yet.</Empty> : (
            <div className="divide-y divide-ink-800">
              {drafts.map((d) => (
                <div key={d.id} className="space-y-1.5 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-semibold text-white">
                      #{d.id} · {d.subject} <span className="text-xs text-ink-400">→ {d.to_name} ({d.to_email})</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="chip bg-gold/15 text-gold">{d.status}</span>
                      <a
                        className="btn-ghost !px-2.5 !py-1 text-xs"
                        href={`mailto:${encodeURIComponent(d.to_email)}?subject=${encodeURIComponent(d.subject)}&body=${encodeURIComponent(d.body)}`}
                        onClick={() => api.updateEmailDraft(d.id, 'Sent').then(loadAll)}
                      >
                        Open in Mail &amp; Mark Sent
                      </a>
                    </div>
                  </div>
                  <pre className="whitespace-pre-wrap rounded bg-black/40 p-2.5 font-sans text-xs text-ink-300">{d.body}</pre>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'audit' && (
        <div className="card p-5">
          <div className="mb-3 text-xs font-bold uppercase tracking-widest text-ink-400">
            MySQL <code>crm_audit</code> Log (<code>audit.php</code>) — Every Login, Verification, Match &amp; Edit
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-ink-700 text-ink-400">
                  <th className="py-2 pr-3">Time</th>
                  <th className="py-2 pr-3">User</th>
                  <th className="py-2 pr-3">Role</th>
                  <th className="py-2 pr-3">Event</th>
                  <th className="py-2 pr-3">Detail</th>
                  <th className="py-2">Path</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-800">
                {audit.map((a) => (
                  <tr key={a.id}>
                    <td className="whitespace-nowrap py-2 pr-3 text-ink-400">{new Date(a.created_at).toLocaleString()}</td>
                    <td className="py-2 pr-3 font-semibold">{a.email}</td>
                    <td className="py-2 pr-3 uppercase text-bam">{a.role}</td>
                    <td className="py-2 pr-3 font-mono text-gold">{a.event}</td>
                    <td className="py-2 pr-3 text-neutral-200">{a.detail}</td>
                    <td className="py-2 font-mono text-ink-400">{a.path}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
