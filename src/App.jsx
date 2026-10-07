import { useCallback, useEffect, useMemo, useState } from "react";
import { PLANS, planById, planAmounts, statusMeta } from "./lib/store";
import {
  apiSignup, apiLogin, apiMe, apiLogout, apiChangePassword, apiUpdateProfile,
  apiDeposit, apiTxns, apiNotifs, apiMarkRead, apiMarkAllRead, apiAck,
  exportLedgerJSON, remoteAvailable, LOCAL_DEMO_CREDS,
} from "./lib/api";

const DISCLAIMER = "This dashboard is a manual ledger tracker. No financial transactions take place on this platform.";

function copyText(text, onOk, onErr) {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(onOk, () => fallback());
  } else fallback();
  function fallback() {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      onOk();
    } catch (e) { onErr?.(e); }
  }
}

function Badge({ status }) {
  const m = statusMeta(status);
  const dot = status === "completed" ? "bg-emerald-400" : "bg-yellow-400 animate-pulse";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${m.classes}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {m.label}
    </span>
  );
}

function Card({ className = "", children }) {
  return <div className={`glass rounded-2xl p-5 shadow-xl shadow-black/30 ${className}`}>{children}</div>;
}

function Field({ label, children, hint }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}
const inputCls = "w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-cyan-400/60 focus:ring-2 focus:ring-cyan-400/20";
const btnPrimary = "rounded-xl bg-gradient-to-r from-cyan-400 to-violet-500 px-4 py-2.5 text-sm font-bold text-[#06121f] hover:brightness-110 active:scale-[.99] disabled:opacity-50 disabled:pointer-events-none transition";
const btnGhost = "rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-white/10 transition";

/* ---------------- Auth: username by user, password by system ---------------- */
function AuthScreen({ onAuthed, toast }) {
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [wallet, setWallet] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState(null); // { username, generatedPassword }
  const [isRemote, setIsRemote] = useState(null);

  useEffect(() => { remoteAvailable().then(setIsRemote).catch(() => setIsRemote(false)); }, []);

  async function submit(e) {
    e.preventDefault();
    setErr(""); setBusy(true);
    try {
      if (mode === "signup") {
        const j = await apiSignup({ username, wallet });
        setIssued({ username: j.user.username, generatedPassword: j.generatedPassword });
        toast(`Account created for ${j.user.username}. Save your system-generated password.`);
      } else {
        const j = await apiLogin({ username, password });
        toast(`Welcome back, ${j.user.username}.`);
        onAuthed();
      }
    } catch (e2) { setErr(e2.message); }
    finally { setBusy(false); }
  }

  if (issued) {
    return (
      <div className="mx-auto w-full max-w-lg px-4 pb-16 pt-16">
        <Card className="border-emerald-400/30">
          <h2 className="text-xl font-black text-emerald-300">✓ Account created</h2>
          <p className="mt-1 text-sm text-slate-300">
            Username: <b className="mono">@{issued.username}</b><br />
            The system generated a random password for you. <b>Save it now — it won't be shown again.</b> You can change it later in Account → Change password.
          </p>
          <div className="mono mt-4 break-all rounded-2xl border border-emerald-400/30 bg-black/50 p-4 text-center text-lg font-bold text-emerald-300">
            {issued.generatedPassword}
          </div>
          <div className="mt-4 flex gap-2">
            <button className={`${btnPrimary} flex-1`} onClick={() => copyText(issued.generatedPassword, () => toast("Password copied. Store it safely."))}>⧉ Copy password</button>
            <button className={btnGhost} onClick={() => { setIssued(null); setMode("login"); setUsername(issued.username); setPassword(""); onAuthed(); }}>I saved it — continue →</button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-6 px-4 pb-16 pt-10 md:grid-cols-2 md:pt-16">
      <div className="flex flex-col justify-center">
        <div className="mb-4 inline-flex w-fit items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs font-bold text-cyan-300">
          <span className="h-2 w-2 rounded-full bg-cyan-300 animate-pulse" /> PWA · MONGODB · MANUAL ONLY
        </div>
        <h1 className="text-4xl font-black leading-tight md:text-5xl">
          LedgerBook <span className="bg-gradient-to-r from-cyan-300 to-violet-400 bg-clip-text text-transparent">P2P</span>
        </h1>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-slate-400">
          A manual peer-to-peer transaction bookkeeping ledger. You choose a <b className="text-slate-200">username</b>,
          the <b className="text-slate-200">system generates a random password</b> for you (changeable anytime).
          Paste your wallet address as text, tap Copy to log a pairing, and let the receiver acknowledge.
        </p>
        <div className="mt-5 rounded-2xl border border-amber-400/25 bg-amber-400/10 p-3.5 text-xs leading-relaxed text-amber-200">
          {DISCLAIMER} No crypto APIs, no wallets, no smart contracts.
        </div>
        <div className="mt-4 text-xs text-slate-500">
          Backend: {isRemote === null ? "checking…" : isRemote ? <span className="text-emerald-300 font-bold">● MongoDB (Vercel API)</span> : <span className="text-yellow-300 font-bold">● Offline dev mode (localStorage)</span>}
          {!isRemote && isRemote !== null && (
            <span className="mt-2 block">Dev demo logins: {LOCAL_DEMO_CREDS.map((c) => <span key={c.username} className="mono ml-1 rounded bg-white/5 px-1.5 py-0.5 text-cyan-300">{c.username} / {c.password}</span>)}</span>
          )}
        </div>
      </div>

      <Card>
        <div className="mb-4 grid grid-cols-2 rounded-xl bg-black/30 p-1 text-sm font-bold">
          {(["login", "signup"]).map((m) => (
            <button key={m} onClick={() => { setMode(m); setErr(""); }}
              className={`rounded-lg py-2 capitalize transition ${mode === m ? "bg-gradient-to-r from-cyan-400 to-violet-500 text-[#06121f]" : "text-slate-400 hover:text-slate-200"}`}>
              {m === "login" ? "Log In" : "Sign Up"}
            </button>
          ))}
        </div>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Username (you choose this)">
            <input className={inputCls} value={username} onChange={(e) => setUsername(e.target.value)} placeholder="e.g. satoshi_01" autoComplete="username" />
          </Field>
          {mode === "login" ? (
            <Field label="Password (generated for you at signup)" hint="Forgot it? There is no reset in this prototype — create a new account or ask the admin to rotate it.">
              <input className={inputCls} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Paste your system password" autoComplete="current-password" />
            </Field>
          ) : (
            <div className="rounded-xl border border-cyan-400/25 bg-cyan-400/10 p-3 text-xs text-cyan-200">
              No password field here — the <b>system will generate a random password</b> for you after signup. You'll copy it once, then can change it in Account settings.
            </div>
          )}
          {mode === "signup" && (
            <Field label="Trust Wallet Address (paste as text)" hint="Stored as a plain text string. Never connects to any wallet.">
              <textarea className={`${inputCls} mono min-h-[76px] text-xs`} value={wallet} onChange={(e) => setWallet(e.target.value)} placeholder="T..." />
            </Field>
          )}
          {err && <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 p-3 text-xs text-rose-300">{err}</div>}
          <button className={`${btnPrimary} w-full`} disabled={busy}>{busy ? "Please wait…" : mode === "signup" ? "Create account — generate my password" : "Log in to dashboard"}</button>
          <p className="text-center text-[11px] text-slate-500">{DISCLAIMER}</p>
        </form>
      </Card>
    </div>
  );
}

/* ---------------- Copy / Deposit modal ---------------- */
function CopyModal({ match, plan, onClose, toast, refresh }) {
  const [copied, setCopied] = useState(false);
  if (!match || !plan) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center">
      <div className="glass w-full max-w-lg rounded-3xl p-6 shadow-2xl">
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-lg font-black">Copy Target Wallet</h3>
          <button onClick={onClose} className="rounded-lg px-2 py-1 text-slate-400 hover:bg-white/10">✕</button>
        </div>
        <p className="text-xs text-slate-400">Matched for <b className="text-slate-200">{plan.name} (${plan.amount})</b> · Target: <b className="text-cyan-300">@{match.targetUsername}</b></p>
        <div className="mt-4 rounded-2xl border border-white/10 bg-black/40 p-4">
          <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">Target wallet address (text only)</div>
          <div className="mono break-all text-sm text-emerald-300">{match.targetWalletSnapshot}</div>
        </div>
        <div className="mt-4 flex gap-2">
          <button
            className={`${btnPrimary} flex-1`}
            onClick={() => copyText(match.targetWalletSnapshot, () => { setCopied(true); toast("Address copied — pairing logged: you → @" + match.targetUsername); refresh(); })}
          >{copied ? "✓ Copied & Logged" : "⧉ Copy Address"}</button>
          <button className={btnGhost} onClick={onClose}>{copied ? "Done" : "Close"}</button>
        </div>
        {copied && (
          <div className="mt-3 rounded-xl border border-emerald-400/25 bg-emerald-400/10 p-3 text-xs text-emerald-200">
            Copy event logged in database: [you] → copied → [@ {match.targetUsername}] for [{plan.name} ${plan.amount}].
            Status is now <b>Awaiting Receiver Confirmation</b>. Complete the transfer <b>outside this app</b>, then wait for them to acknowledge.
          </div>
        )}
        <p className="mt-3 text-[11px] text-slate-500">{DISCLAIMER}</p>
      </div>
    </div>
  );
}

/* ---------------- Dashboard ---------------- */
function Dashboard({ me, setMe, toast }) {
  const [tab, setTab] = useState("overview");
  const [planPick, setPlanPick] = useState(me.plan || "bronze");
  const [match, setMatch] = useState(null);
  const [ackAmounts, setAckAmounts] = useState({});
  const [txns, setTxns] = useState([]);
  const [notifs, setNotifs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [installEvt, setInstallEvt] = useState(null);
  const [pwForm, setPwForm] = useState({ current: "", next: "", confirm: "" });
  const [isRemote, setIsRemote] = useState(null);

  useEffect(() => {
    const h = (e) => { e.preventDefault(); setInstallEvt(e); };
    window.addEventListener("beforeinstallprompt", h);
    return () => window.removeEventListener("beforeinstallprompt", h);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [u, t, n] = await Promise.all([apiMe(), apiTxns(), apiNotifs()]);
      if (u) setMe(u);
      setTxns(t || []);
      setNotifs(n || []);
    } catch (e) { toast(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    refresh();
    remoteAvailable().then(setIsRemote).catch(() => setIsRemote(false));
    const t = setInterval(refresh, 8000);
    return () => clearInterval(t);
  }, [refresh]);

  const unread = useMemo(() => notifs.filter((n) => !n.read).length, [notifs]);
  const activePlan = planById(me.plan);
  const sent = txns.filter((t) => t.senderId === me.id);
  const pending = txns.filter((t) => t.status !== "completed");
  const received = txns.filter((t) => t.targetId === me.id);

  async function doDeposit() {
    try {
      const plan = planById(planPick);
      if (me.plan !== planPick) {
        const u = await apiUpdateProfile({ plan: planPick });
        setMe(u);
      }
      const res = await apiDeposit(planPick);
      setMatch({ ...res.txn, targetWalletSnapshot: res.txn.targetWalletSnapshot });
      toast(`Matched with @${res.target.username} for ${plan.name}.`);
      refresh();
    } catch (e) { toast(e.message); }
  }

  async function doAck(txnId) {
    try {
      await apiAck({ txnId, verifiedAmount: ackAmounts[txnId] });
      toast("Acknowledged & confirmed. Ledger status → Completed.");
      refresh();
    } catch (e) { toast(e.message); }
  }

  async function doChangePassword(e) {
    e.preventDefault();
    try {
      if (pwForm.next !== pwForm.confirm) throw new Error("New passwords don't match.");
      await apiChangePassword({ currentPassword: pwForm.current, newPassword: pwForm.next });
      setPwForm({ current: "", next: "", confirm: "" });
      toast("Password changed. Use your new password next login.");
    } catch (err) { toast(err.message); }
  }

  const tabs = [
    { id: "overview", label: "Dashboard" },
    { id: "plans", label: "Plans & Deposit" },
    { id: "ledger", label: "Ledger" },
    { id: "alerts", label: `Alerts${unread ? ` (${unread})` : ""}` },
    { id: "account", label: "Account" },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-20">
      <header className="sticky top-0 z-40 -mx-4 border-b border-white/5 bg-[#080b14]/85 px-4 py-3 backdrop-blur-lg">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-cyan-400 to-violet-500 font-black text-[#06121f]">₿</div>
            <div>
              <div className="text-sm font-black leading-none">LedgerBook P2P</div>
              <div className="mono text-[10px] text-slate-500">@{me.username} · {isRemote ? "MongoDB" : "offline"} · manual ledger</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {installEvt && <button className={btnGhost} onClick={() => installEvt.prompt()}>⬇ Install App</button>}
            <button className={btnGhost} onClick={() => { apiLogout(); window.location.reload(); }}>Log out</button>
          </div>
        </div>
        <div className="mx-auto mt-3 flex max-w-6xl gap-1.5 overflow-x-auto pb-1">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => { setTab(t.id); refresh(); }}
              className={`whitespace-nowrap rounded-xl px-3.5 py-2 text-xs font-bold transition ${tab === t.id ? "bg-gradient-to-r from-cyan-400 to-violet-500 text-[#06121f]" : "border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"}`}>
              {t.label}
            </button>
          ))}
        </div>
      </header>

      <div className="mt-4 rounded-2xl border border-amber-400/25 bg-amber-400/10 px-4 py-2.5 text-center text-xs text-amber-200">
        {DISCLAIMER}
      </div>

      {loading && <div className="mt-6 text-center text-xs text-slate-500">Loading ledger from {isRemote ? "MongoDB" : "local store"}…</div>}

      {!loading && tab === "overview" && (
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <Card>
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Active plan</div>
            {activePlan ? (
              <>
                <div className="mt-1 text-2xl font-black">{activePlan.name}</div>
                <div className="text-sm text-slate-400">${activePlan.amount} tracking tier</div>
                <button className={`${btnGhost} mt-3 w-full`} onClick={() => setTab("plans")}>Change / Deposit</button>
              </>
            ) : (
              <>
                <div className="mt-1 text-lg font-bold text-slate-300">No plan selected</div>
                <button className={`${btnPrimary} mt-3 w-full`} onClick={() => setTab("plans")}>Select a plan</button>
              </>
            )}
            <div className="mono mt-3 break-all rounded-xl bg-black/40 p-2.5 text-[11px] text-slate-400">
              my wallet (text): <span className="text-cyan-300">{me.wallet}</span>
            </div>
          </Card>
          <Card>
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Ledger stats</div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-center">
              {[["Sent entries", sent.length], ["Received", received.length], ["Pending", pending.length], ["Completed", txns.length - pending.length]].map(([l, v]) => (
                <div key={l} className="rounded-xl bg-black/30 p-3">
                  <div className="text-2xl font-black">{v}</div>
                  <div className="text-[11px] text-slate-500">{l}</div>
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Notification alerts</div>
              {unread > 0 && <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[11px] font-black">{unread} new</span>}
            </div>
            <div className="mt-2 max-h-44 space-y-2 overflow-y-auto">
              {notifs.slice(0, 4).map((n) => (
                <div key={n.id} className={`rounded-xl border p-2.5 text-xs ${n.read ? "border-white/5 bg-white/[.02] text-slate-400" : "border-cyan-400/25 bg-cyan-400/10 text-cyan-100"}`}>{n.text}</div>
              ))}
              {notifs.length === 0 && <div className="text-xs text-slate-500">No alerts yet. When someone copies your address you'll be notified here.</div>}
            </div>
            <button className={`${btnGhost} mt-3 w-full`} onClick={() => setTab("alerts")}>Open inbox</button>
          </Card>
          <div className="md:col-span-3"><LedgerTable txns={txns.slice(0, 6)} me={me} compact title="Recent ledger entries" /></div>
        </div>
      )}

      {!loading && tab === "plans" && (
        <div className="mt-4 grid gap-4">
          <Card>
            <h2 className="text-lg font-black">1 · Select plan</h2>
            <p className="text-xs text-slate-400">Pick a tier package from the cards or the dropdown, then press Deposit to run the matching book.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {PLANS.map((p) => (
                <button key={p.id} onClick={() => setPlanPick(p.id)}
                  className={`rounded-2xl border p-4 text-left transition ${planPick === p.id ? "border-cyan-300 bg-cyan-400/10 shadow-lg shadow-cyan-500/10" : "border-white/10 bg-black/30 hover:border-white/25"}`}>
                  <div className="h-1.5 w-10 rounded-full" style={{ background: p.color }} />
                  <div className="mt-2 text-sm font-black">{p.name}</div>
                  <div className="text-xl font-black text-slate-100">${p.amount}</div>
                  <div className="text-[11px] text-slate-500">{p.desc}</div>
                </button>
              ))}
            </div>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <select className={`${inputCls} sm:max-w-xs`} value={planPick} onChange={(e) => setPlanPick(e.target.value)}>
                {PLANS.map((p) => <option key={p.id} value={p.id}>{p.name} — ${p.amount}</option>)}
              </select>
              <button className={btnPrimary} onClick={doDeposit}>Deposit — find match & show wallet</button>
            </div>
          </Card>
          <LedgerTable txns={sent.slice(0, 8)} me={me} title="My deposit entries (as sender)" />
        </div>
      )}

      {!loading && tab === "ledger" && (
        <div className="mt-4 grid gap-4">
          <div className="flex flex-wrap gap-2">
            <button className={btnGhost} onClick={() => exportLedgerJSON(txns)}>⬇ Export my ledger (JSON)</button>
            <button className={btnGhost} onClick={refresh}>↻ Refresh statuses</button>
          </div>
          <LedgerTable txns={txns} me={me} title="Visual ledger — Date · Partner · Tier Amount · Status" />
        </div>
      )}

      {!loading && tab === "alerts" && (
        <div className="mt-4 grid gap-4">
          <Card className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-black">Inbox — target-user notifications</h2>
              <p className="text-xs text-slate-400">Acknowledge entries where you are the receiver. Only you can confirm these.</p>
            </div>
            <button className={btnGhost} onClick={async () => { await apiMarkAllRead(); refresh(); }}>Mark all read</button>
          </Card>
          {notifs.length === 0 && <Card><div className="text-sm text-slate-400">Inbox empty. Deposit entries from other users will appear here.</div></Card>}
          {notifs.map((n) => {
            const txn = txns.find((t) => t.id === n.txnId || t.id === n.txnId);
            const isReceiver = txn && txn.targetId === me.id;
            return (
              <Card key={n.id} className={n.read ? "opacity-75" : "border-cyan-400/30"}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="text-sm">{n.text}</div>
                  {!n.read && <button className="text-xs text-cyan-300 underline" onClick={async () => { await apiMarkRead(n.id); refresh(); }}>mark read</button>}
                </div>
                <div className="mono mt-1 text-[11px] text-slate-500">{n.createdAt ? new Date(n.createdAt).toLocaleString() : ""} · {n.read ? "read" : "unread"}</div>
                {txn && (
                  <div className="mt-3 rounded-xl bg-black/30 p-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="text-slate-400">Entry:</span>
                      <b>{txn.planName} ${txn.amount}</b>
                      <Badge status={txn.status} />
                      {txn.status === "completed" && <span className="text-emerald-300">· verified ${txn.verifiedAmount}</span>}
                    </div>
                    {isReceiver && txn.status !== "completed" ? (
                      <div className="mt-2.5 flex flex-col gap-2 sm:flex-row">
                        <select className={`${inputCls} sm:max-w-xs`} value={ackAmounts[txn.id] ?? ""} onChange={(e) => setAckAmounts((s) => ({ ...s, [txn.id]: e.target.value }))}>
                          <option value="">Select verified amount…</option>
                          {planAmounts().map((a) => <option key={a} value={a}>${a} — verified in external wallet</option>)}
                        </select>
                        <button className={btnPrimary} onClick={() => doAck(txn.id)}>Acknowledge & Confirm</button>
                      </div>
                    ) : isReceiver ? (
                      <div className="mt-2 text-xs text-emerald-300">✓ You confirmed this entry.</div>
                    ) : (
                      <div className="mt-2 text-xs text-slate-500">Waiting on @{txn.targetUsername} (receiver) to acknowledge.</div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {!loading && tab === "account" && (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Card>
            <h2 className="text-lg font-black">Profile</h2>
            <div className="mt-3 space-y-3">
              <Field label="Username (set by you at signup)"><input className={inputCls} value={me.username} disabled /></Field>
              <Field label="Trust Wallet Address (text string)">
                <textarea className={`${inputCls} mono min-h-[70px] text-xs`} defaultValue={me.wallet} id="walletEdit" />
              </Field>
              <button className={btnPrimary} onClick={async () => {
                const v = document.getElementById("walletEdit").value.trim();
                if (v.length < 10) return toast("Wallet text must be at least 10 characters.");
                const u = await apiUpdateProfile({ wallet: v });
                setMe(u); toast("Wallet text updated.");
              }}>Save wallet text</button>
            </div>
          </Card>
          <Card className="border-violet-400/25">
            <h2 className="text-lg font-black">Change password</h2>
            <p className="text-xs text-slate-400">Your password was generated by the system at signup. You can change it here anytime.</p>
            <form onSubmit={doChangePassword} className="mt-3 space-y-3">
              <Field label="Current password">
                <input className={inputCls} type="password" value={pwForm.current} onChange={(e) => setPwForm({ ...pwForm, current: e.target.value })} autoComplete="current-password" />
              </Field>
              <Field label="New password (min 8 chars)">
                <input className={inputCls} type="password" value={pwForm.next} onChange={(e) => setPwForm({ ...pwForm, next: e.target.value })} autoComplete="new-password" />
              </Field>
              <Field label="Confirm new password">
                <input className={inputCls} type="password" value={pwForm.confirm} onChange={(e) => setPwForm({ ...pwForm, confirm: e.target.value })} autoComplete="new-password" />
              </Field>
              <button className={btnPrimary} type="submit">Update password</button>
            </form>
          </Card>
          <Card className="md:col-span-2">
            <h2 className="text-lg font-black">Backend · git / Vercel / MongoDB</h2>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-xs text-slate-400">
              <li>Connected store: <b className="text-slate-200">{isRemote ? "MongoDB via /api (Vercel serverless)" : "Offline local fallback"}</b>. Set <span className="mono">MONGODB_URI</span> + <span className="mono">JWT_SECRET</span> in Vercel env vars for production.</li>
              <li>PWA: browser menu → <b className="text-slate-200">Add to Home Screen</b>; app shell cached by the service worker.</li>
            </ul>
            {installEvt
              ? <button className={`${btnPrimary} mt-3`} onClick={() => installEvt.prompt()}>⬇ Install LedgerBook PWA</button>
              : <p className="mt-3 text-xs text-slate-500">Install prompt appears automatically on supported browsers once PWA criteria are met.</p>}
          </Card>
        </div>
      )}

      {match && (
        <CopyModal match={match} plan={planById(match.planId)} onClose={() => setMatch(null)} toast={toast} refresh={refresh} />
      )}
    </div>
  );
}

function LedgerTable({ txns, me, title, compact }) {
  return (
    <Card>
      <h2 className="text-lg font-black">{title}</h2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-slate-500">
              <th className="pb-2 pr-3">Date</th>
              <th className="pb-2 pr-3">Partner</th>
              <th className="pb-2 pr-3">Tier Amount</th>
              <th className="pb-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {txns.map((t) => {
              const isSender = t.senderId === me.id;
              const partner = isSender ? `@${t.targetUsername}` : `@${t.senderUsername}`;
              return (
                <tr key={t.id} className="border-t border-white/5">
                  <td className="py-2.5 pr-3 text-xs text-slate-400">{t.createdAt ? new Date(t.createdAt).toLocaleString() : "—"}</td>
                  <td className="py-2.5 pr-3">
                    <span className="font-bold text-slate-100">{partner}</span>
                    <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-bold ${isSender ? "bg-violet-500/15 text-violet-300" : "bg-cyan-500/15 text-cyan-300"}`}>
                      {isSender ? "SENT" : "RECEIVED"}
                    </span>
                    {!compact && <div className="mono text-[10px] text-slate-500">{t.planName}</div>}
                  </td>
                  <td className="py-2.5 pr-3 font-black">${t.amount}</td>
                  <td className="py-2.5"><Badge status={t.status} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {txns.length === 0 && <div className="py-6 text-center text-xs text-slate-500">No entries yet — go to Plans & Deposit to create your first manual record.</div>}
      </div>
    </Card>
  );
}

/* ---------------- root ---------------- */
export default function App() {
  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    apiMe().then((u) => { setMe(u); setReady(true); }).catch(() => setReady(true));
  }, []);

  function toast(msg) {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }

  return (
    <div className="min-h-screen bg-[#080b14] bg-[radial-gradient(60rem_30rem_at_50%_-10rem,rgba(34,211,238,.12),transparent),radial-gradient(40rem_20rem_at_90%_10rem,rgba(167,139,250,.10),transparent)] text-slate-100">
      {!ready ? (
        <div className="grid min-h-screen place-items-center text-sm text-slate-500">Loading…</div>
      ) : !me ? (
        <AuthScreen onAuthed={async () => setMe(await apiMe())} toast={toast} />
      ) : (
        <Dashboard me={me} setMe={setMe} toast={toast} />
      )}
      <footer className="mx-auto max-w-6xl px-4 pb-10 text-center text-[11px] text-slate-600">
        LedgerBook P2P · manual record-keeping only · {DISCLAIMER}
      </footer>
      <div className="fixed bottom-4 left-1/2 z-[60] flex w-full max-w-md -translate-x-1/2 flex-col gap-2 px-4">
        {toasts.map((t) => (
          <div key={t.id} className="glass rounded-2xl border-cyan-400/30 px-4 py-3 text-xs font-semibold text-cyan-100 shadow-2xl">{t.msg}</div>
        ))}
      </div>
    </div>
  );
}
