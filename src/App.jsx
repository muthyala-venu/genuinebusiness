import { useCallback, useEffect, useMemo, useState } from "react";
import { PLANS, planById, planAmounts, statusMeta } from "./lib/store";
import {
  apiSignup, apiLogin, apiMe, apiLogout, apiChangePassword, apiUpdateProfile,
  apiDeposit, apiTxns, apiNotifs, apiMarkRead, apiMarkAllRead, apiAck,
  exportLedgerJSON, remoteAvailable, LOCAL_DEMO_CREDS, apiLookupPartner,
} from "./lib/api";

const DISCLAIMER = "This dashboard is a manual ledger tracker. No financial transactions take place on this platform.";
const BRAND_TAGLINE = "Every handshake, recorded.";

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

function Logo({ size = "h-9 w-9 text-base" }) {
  return (
    <div className={`grid ${size} shrink-0 place-items-center rounded-xl bg-gradient-to-br from-cyan-400 to-violet-500 font-black text-[#06121f]`}>₿</div>
  );
}

const inputCls = "w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-cyan-400/60 focus:ring-2 focus:ring-cyan-400/20";
const btnPrimary = "rounded-xl bg-gradient-to-r from-cyan-400 to-violet-500 px-4 py-2.5 text-sm font-bold text-[#06121f] hover:brightness-110 active:scale-[.99] disabled:opacity-50 disabled:pointer-events-none transition";
const btnGhost = "rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-white/10 transition";

/* ================= Auth ================= */
function AuthScreen({ onAuthed, toast }) {
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [wallet, setWallet] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState(null);
  const [isRemote, setIsRemote] = useState(null);

  useEffect(() => { remoteAvailable().then(setIsRemote).catch(() => setIsRemote(false)); }, []);

  async function submit(e) {
    e.preventDefault();
    setErr(""); setBusy(true);
    try {
      if (mode === "signup") {
        const j = await apiSignup({ username, wallet });
        setIssued({ username: j.user.username, generatedPassword: j.generatedPassword });
        toast(`Welcome to the circle, ${j.user.username}. Save your password.`);
      } else {
        const j = await apiLogin({ username, password });
        toast(`Welcome back, ${j.user.username}. Your ledger is up to date.`);
        onAuthed();
      }
    } catch (e2) { setErr(e2.message); }
    finally { setBusy(false); }
  }

  if (issued) {
    return (
      <div className="mx-auto w-full max-w-lg px-4 pb-16 pt-16">
        <Card className="rise border-emerald-400/30 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-emerald-400/15 text-2xl">✓</div>
          <h2 className="mt-3 text-xl font-black">You're in, @{issued.username}</h2>
          <p className="mt-1 text-sm text-slate-400">
            Your personal password was created just now. <b className="text-slate-200">Copy it somewhere safe — this is the only time we show it.</b> You can change it anytime under Account → Security.
          </p>
          <div className="mono mt-4 break-all rounded-2xl border border-emerald-400/30 bg-black/50 p-4 text-center text-lg font-bold tracking-wider text-emerald-300">
            {issued.generatedPassword}
          </div>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <button className={`${btnPrimary} flex-1`} onClick={() => copyText(issued.generatedPassword, () => toast("Password copied. Keep it somewhere safe."))}>⧉ Copy my password</button>
            <button className={`${btnGhost} flex-1`} onClick={() => { setIssued(null); setMode("login"); setUsername(issued.username); setPassword(""); onAuthed(); }}>Saved — take me in →</button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-16">
      {/* top brand bar */}
      <div className="rise flex items-center justify-between py-5">
        <div className="flex items-center gap-2.5">
          <Logo />
          <div>
            <div className="text-sm font-black leading-none">LedgerBook P2P</div>
            <div className="text-[11px] text-slate-500">{BRAND_TAGLINE}</div>
          </div>
        </div>
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-bold text-slate-400">Works offline · Installs like an app</span>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[1.15fr_1fr]">
        {/* hero */}
        <div className="rise rise-1 pt-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-cyan-300">
            <span className="h-2 w-2 rounded-full bg-cyan-300 animate-pulse" /> Shared notebook · installs like an app
          </div>
          <h1 className="mt-4 text-4xl font-black leading-[1.05] md:text-[3.4rem]">
            Handshake deals deserve a <span className="bg-gradient-to-r from-cyan-300 via-sky-300 to-violet-400 bg-clip-text text-transparent">clean record.</span>
          </h1>
          <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-slate-400">
            <b className="text-slate-100">LedgerBook P2P</b> is the shared notebook for trusted exchange circles.
            When two people settle something offline, both sides leave a trace here — you paste the wallet text your partner shared
            (over WhatsApp or in person), confirm their profile, and send a request; the receiver then confirms with <b className="text-slate-200">Acknowledge</b>,
            and the ledger glows green. Simple, transparent, dispute-free.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {[
              { t: "You pick a name", d: "Choose any username. Your password is generated for you — strong by default.", i: "◎" },
              { t: "You bring the partner", d: "Agree on WhatsApp or in person, paste their wallet text, and we show their profile.", i: "◇" },
              { t: "Both sides confirm", d: "Nothing turns green until the receiver verifies and acknowledges.", i: "✓" },
            ].map((f) => (
              <div key={f.t} className="glass rounded-2xl p-4">
                <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-cyan-400/25 to-violet-500/25 font-black text-cyan-300">{f.i}</div>
                <div className="mt-2 text-sm font-black">{f.t}</div>
                <div className="mt-1 text-xs leading-relaxed text-slate-500">{f.d}</div>
              </div>
            ))}
          </div>

          {/* sample ledger preview */}
          <div className="glass mt-4 overflow-hidden rounded-2xl">
            <div className="flex items-center justify-between border-b border-white/5 px-4 py-2.5">
              <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500">How a record looks</span>
              <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-slate-500">sample</span>
            </div>
            {[
              { p: "@partner · Silver $350", s: "completed" },
              { p: "@partner · Bronze $150", s: "awaiting_confirmation" },
            ].map((r) => (
              <div key={r.p} className="flex items-center justify-between gap-2 px-4 py-2.5 text-xs odd:bg-white/[.015]">
                <span className="font-semibold text-slate-300">{r.p}</span>
                <Badge status={r.s} />
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-2xl border border-amber-400/25 bg-amber-400/10 p-3.5 text-xs leading-relaxed text-amber-200">
            {DISCLAIMER} No crypto connections, no wallets, no smart contracts — pen-and-paper honesty, digitised.
          </div>
        </div>

        {/* auth card */}
        <Card className="rise rise-2 lg:sticky lg:top-6">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-lg font-black">{mode === "login" ? "Welcome back" : "Join the circle"}</h2>
            <span className="text-[11px] text-slate-500">{mode === "login" ? "Pick up where you left off" : "Takes 30 seconds"}</span>
          </div>
          <p className="mb-4 text-xs text-slate-500">
            {mode === "login"
              ? "Log in with the username you chose and the password the system gave you."
              : "Choose a username and paste your public wallet text — we'll forge a strong random password for you."}
          </p>
          <div className="mb-4 grid grid-cols-2 rounded-xl bg-black/30 p-1 text-sm font-bold">
            {(["login", "signup"]).map((m) => (
              <button key={m} onClick={() => { setMode(m); setErr(""); }}
                className={`rounded-lg py-2 capitalize transition ${mode === m ? "bg-gradient-to-r from-cyan-400 to-violet-500 text-[#06121f]" : "text-slate-400 hover:text-slate-200"}`}>
                {m === "login" ? "Log In" : "Sign Up"}
              </button>
            ))}
          </div>
          <form onSubmit={submit} className="space-y-4">
            <Field label="Username — make it yours">
              <input className={inputCls} value={username} onChange={(e) => setUsername(e.target.value)} placeholder="e.g. satoshi_01" autoComplete="username" />
            </Field>
            {mode === "login" ? (
              <Field label="Your system password" hint="Lost it? Passwords can't be recovered here — just create a fresh account to start over.">
                <input className={inputCls} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Paste the password we generated" autoComplete="current-password" />
              </Field>
            ) : (
              <div className="rounded-xl border border-cyan-400/25 bg-cyan-400/10 p-3 text-xs leading-relaxed text-cyan-200">
                <b>No password to invent.</b> The moment you join, the system forges a strong random password for you — shown once, changeable anytime.
              </div>
            )}
            {mode === "signup" && (
              <Field label="Public wallet text" hint="Paste your Trust Wallet address as plain text. It is only ever displayed and copied — never connected.">
                <textarea className={`${inputCls} mono min-h-[72px] text-xs`} value={wallet} onChange={(e) => setWallet(e.target.value)} placeholder="T…" />
              </Field>
            )}
            {err && <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 p-3 text-xs text-rose-300">{err}</div>}
            <button className={`${btnPrimary} w-full`} disabled={busy}>{busy ? "One moment…" : mode === "signup" ? "Join — forge my password" : "Open my ledger"}</button>
            {/* dev-only shortcut: stripped from production builds, never shown on the live site */}
            {!isRemote && isRemote !== null && import.meta.env.DEV && (
              <div className="rounded-xl bg-black/30 p-3 text-[11px] leading-relaxed text-slate-500">
                Quick look — try one tap:
                <span className="mt-1.5 flex flex-wrap gap-1.5">
                  {LOCAL_DEMO_CREDS.map((c) => (
                    <button type="button" key={c.username} onClick={() => { setMode("login"); setUsername(c.username); setPassword(c.password); setErr(""); }}
                      className="mono rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-cyan-300 hover:bg-white/10">{c.username}</button>
                  ))}
                </span>
              </div>
            )}
            <p className="text-center text-[11px] text-slate-500">{DISCLAIMER}</p>
          </form>
        </Card>
      </div>

      {/* how it works */}
      <div className="rise rise-3 mt-8 grid gap-3 md:grid-cols-4">
        {[
          ["01", "Join & save password", "Pick a username, paste your wallet text, keep the generated password."],
          ["02", "Agree outside the app", "Settle the tier with your partner on WhatsApp or in person and get their wallet text."],
          ["03", "Paste it here & request", "We pull up their profile for you to confirm — then you send a pairing request."],
          ["04", "Partner acknowledges", "They verify offline, confirm here, and your ledger turns green."],
        ].map(([n, t, d]) => (
          <div key={n} className="glass rounded-2xl p-4">
            <div className="mono text-xs font-black text-cyan-400">{n}</div>
            <div className="mt-1 text-sm font-black">{t}</div>
            <div className="mt-1 text-xs leading-relaxed text-slate-500">{d}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ================= Request-sent modal ================= */
function RequestModal({ receipt, plan, onClose, toast }) {
  const [copied, setCopied] = useState(false);
  if (!receipt || !plan) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center">
      <div className="glass rise w-full max-w-lg rounded-3xl p-6 shadow-2xl">
        <div className="mb-1 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-black">Request sent to @{receipt.targetUsername}</h3>
            <p className="text-xs text-slate-400"><b className="text-slate-200">{plan.name} · ${plan.amount}</b> · they've been notified in their inbox</p>
          </div>
          <button onClick={onClose} className="rounded-lg px-2 py-1 text-slate-400 hover:bg-white/10">✕</button>
        </div>
        <div className="mt-4 rounded-2xl border border-white/10 bg-black/40 p-4">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Their public wallet text</span>
            <span className="text-[10px] text-slate-600">text only · nothing connects</span>
          </div>
          <div className="mono break-all text-sm text-emerald-300">{receipt.targetWalletSnapshot}</div>
        </div>
        <div className="mt-4 flex gap-2">
          <button
            className={`${btnGhost} flex-1`}
            onClick={() => copyText(receipt.targetWalletSnapshot, () => { setCopied(true); toast("Address copied for your own records."); })}
          >{copied ? "✓ Copied" : "⧉ Copy address"}</button>
          <button className={btnPrimary} onClick={onClose}>Done</button>
        </div>
        <div className="mt-3 rounded-xl border border-emerald-400/25 bg-emerald-400/10 p-3 text-xs leading-relaxed text-emerald-200">
          Pairing recorded: <b>you → @{receipt.targetUsername}</b> · {plan.name} ${plan.amount} · status <b>Awaiting Receiver Confirmation</b>.<br />
          Next: settle it <b>outside this app</b>, then your partner acknowledges here and the entry turns <b>Completed</b>.
        </div>
        <p className="mt-3 text-[11px] text-slate-500">{DISCLAIMER}</p>
      </div>
    </div>
  );
}

/* ================= Dashboard ================= */
function Dashboard({ me, setMe, toast }) {
  const [tab, setTab] = useState("overview");
  const [planPick, setPlanPick] = useState(me.plan || "bronze");
  const [receipt, setReceipt] = useState(null);
  const [partnerWallet, setPartnerWallet] = useState("");
  const [partner, setPartner] = useState(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [ackAmounts, setAckAmounts] = useState({});
  const [txns, setTxns] = useState([]);
  const [notifs, setNotifs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [installEvt, setInstallEvt] = useState(null);
  const [pwForm, setPwForm] = useState({ current: "", next: "", confirm: "" });

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
    const t = setInterval(refresh, 8000);
    return () => clearInterval(t);
  }, [refresh]);

  const unread = useMemo(() => notifs.filter((n) => !n.read).length, [notifs]);
  const activePlan = planById(me.plan);
  const sent = txns.filter((t) => t.senderId === me.id);
  const pending = txns.filter((t) => t.status !== "completed");
  const received = txns.filter((t) => t.targetId === me.id);

  async function doLookup() {
    try {
      setLookingUp(true);
      const j = await apiLookupPartner(partnerWallet);
      setPartner(j.partner);
      toast(`Found @${j.partner.username} — check it's the right person.`);
    } catch (e) { setPartner(null); toast(e.message); }
    finally { setLookingUp(false); }
  }

  async function doRequest() {
    if (!partner) return;
    try {
      setRequesting(true);
      const plan = planById(planPick);
      if (me.plan !== planPick) {
        const u = await apiUpdateProfile({ plan: planPick });
        setMe(u);
      }
      const res = await apiDeposit(planPick, partnerWallet);
      setReceipt({ ...res.txn, targetWalletSnapshot: res.txn.targetWalletSnapshot });
      setPartner(null);
      setPartnerWallet("");
      toast(`Request sent to @${res.target.username} for ${plan.name}.`);
      refresh();
    } catch (e) { toast(e.message); }
    finally { setRequesting(false); }
  }

  async function doAck(txnId) {
    try {
      await apiAck({ txnId, verifiedAmount: ackAmounts[txnId] });
      toast("Confirmed — that entry is now Completed on both sides.");
      refresh();
    } catch (e) { toast(e.message); }
  }

  async function doChangePassword(e) {
    e.preventDefault();
    try {
      if (pwForm.next !== pwForm.confirm) throw new Error("The new passwords don't match — try again.");
      await apiChangePassword({ currentPassword: pwForm.current, newPassword: pwForm.next });
      setPwForm({ current: "", next: "", confirm: "" });
      toast("Password updated. Use the new one from your next login.");
    } catch (err) { toast(err.message); }
  }

  const tabs = [
    { id: "overview", label: "Home" },
    { id: "plans", label: "Tiers & Pairing" },
    { id: "ledger", label: "Ledger" },
    { id: "alerts", label: `Inbox${unread ? ` (${unread})` : ""}` },
    { id: "account", label: "Account" },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-20">
      <header className="sticky top-0 z-40 -mx-4 border-b border-white/5 bg-[#080b14]/85 px-4 py-3 backdrop-blur-lg">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Logo />
            <div>
              <div className="text-sm font-black leading-none">LedgerBook P2P</div>
              <div className="mono text-[10px] text-slate-500">@{me.username} · {BRAND_TAGLINE}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {installEvt && <button className={btnGhost} onClick={() => installEvt.prompt()}>⬇ Install app</button>}
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

      {loading && <div className="mt-6 text-center text-xs text-slate-500">Opening your ledger…</div>}

      {!loading && tab === "overview" && (
        <div className="rise mt-4">
          <h2 className="text-xl font-black">Good to see you, @{me.username}</h2>
          <p className="text-xs text-slate-500">Here's your circle activity at a glance — anything amber still needs its other half.</p>
          <div className="mt-3 grid gap-4 md:grid-cols-3">
            <Card>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Your tier</div>
              {activePlan ? (
                <>
                  <div className="mt-1 text-2xl font-black">{activePlan.name} <span className="text-base text-slate-400">${activePlan.amount}</span></div>
                  <div className="text-xs text-slate-500">{activePlan.desc}</div>
                  <button className={`${btnGhost} mt-3 w-full`} onClick={() => setTab("plans")}>Pair on this tier →</button>
                </>
              ) : (
                <>
                  <div className="mt-1 text-lg font-bold text-slate-300">No tier yet</div>
                  <div className="text-xs text-slate-500">Pick the tier that matches your offline arrangement.</div>
                  <button className={`${btnPrimary} mt-3 w-full`} onClick={() => setTab("plans")}>Choose my tier</button>
                </>
              )}
              <div className="mono mt-3 break-all rounded-xl bg-black/40 p-2.5 text-[11px] text-slate-400">
                my wallet text: <span className="text-cyan-300">{me.wallet}</span>
              </div>
            </Card>
            <Card>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Circle stats</div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-center">
                {[["You logged", sent.length], ["Logged for you", received.length], ["Waiting", pending.length], ["Completed", txns.length - pending.length]].map(([l, v]) => (
                  <div key={l} className="rounded-xl bg-black/30 p-3">
                    <div className="text-2xl font-black">{v}</div>
                    <div className="text-[11px] text-slate-500">{l}</div>
                  </div>
                ))}
              </div>
            </Card>
            <Card>
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Latest notes</div>
                {unread > 0 && <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[11px] font-black">{unread} new</span>}
              </div>
              <div className="mt-2 max-h-44 space-y-2 overflow-y-auto">
                {notifs.slice(0, 4).map((n) => (
                  <div key={n.id} className={`rounded-xl border p-2.5 text-xs ${n.read ? "border-white/5 bg-white/[.02] text-slate-400" : "border-cyan-400/25 bg-cyan-400/10 text-cyan-100"}`}>{n.text}</div>
                ))}
                {notifs.length === 0 && <div className="text-xs leading-relaxed text-slate-500">All quiet. When someone pairs with you, their note lands here — that's your cue to verify offline and acknowledge.</div>}
              </div>
              <button className={`${btnGhost} mt-3 w-full`} onClick={() => setTab("alerts")}>Open inbox</button>
            </Card>
            <div className="md:col-span-3"><LedgerTable txns={txns.slice(0, 6)} me={me} compact title="Fresh from the ledger" /></div>
          </div>
        </div>
      )}

      {!loading && tab === "plans" && (
        <div className="rise mt-4 grid gap-4">
          <Card>
            <h2 className="text-lg font-black">1 · Pick your tier</h2>
            <p className="text-xs text-slate-400">Choose the tier that mirrors the arrangement you already agreed with your partner.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {PLANS.map((p) => (
                <button key={p.id} onClick={() => setPlanPick(p.id)}
                  className={`relative rounded-2xl border p-4 text-left transition ${planPick === p.id ? "border-cyan-300 bg-cyan-400/10 shadow-lg shadow-cyan-500/10" : "border-white/10 bg-black/30 hover:border-white/25"}`}>
                  <span className="absolute right-3 top-3 rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-bold text-slate-400">{p.tag}</span>
                  <div className="h-1.5 w-10 rounded-full" style={{ background: p.color }} />
                  <div className="mt-2 text-sm font-black">{p.name}</div>
                  <div className="text-xl font-black text-slate-100">${p.amount} <span className="text-[11px] font-semibold text-slate-500">tier</span></div>
                  <div className="mt-1 text-[11px] leading-relaxed text-slate-500">{p.desc}</div>
                </button>
              ))}
            </div>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
              <select className={`${inputCls} sm:max-w-xs`} value={planPick} onChange={(e) => setPlanPick(e.target.value)}>
                {PLANS.map((p) => <option key={p.id} value={p.id}>{p.name} — ${p.amount} · {p.tag}</option>)}
              </select>
            </div>
          </Card>
          <Card className="border-cyan-400/20">
            <h2 className="text-lg font-black">2 · Find your partner</h2>
            <p className="text-xs leading-relaxed text-slate-400">
              Got their Trust Wallet address on <b className="text-slate-200">WhatsApp or in person</b>? Paste it in the search bar —
              we'll show you the profile of the person it belongs to, so you can confirm before requesting.
            </p>
            <form
              className="mt-3 flex flex-col gap-2 sm:flex-row"
              onSubmit={(e) => { e.preventDefault(); doLookup(); }}
            >
              <div className="relative flex-1">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500">⌕</span>
                <input
                  className={`${inputCls} mono pl-9 text-xs`}
                  value={partnerWallet}
                  onChange={(e) => { setPartnerWallet(e.target.value); setPartner(null); }}
                  placeholder="Paste Trust Wallet address…  (e.g. T…)"
                  autoComplete="off"
                  spellCheck="false"
                />
              </div>
              <button type="submit" className={btnPrimary} disabled={lookingUp || !partnerWallet.trim()}>
                {lookingUp ? "Searching…" : "Search"}
              </button>
            </form>
            {partner && (
              <div className="rise mt-3 rounded-2xl border border-emerald-400/30 bg-emerald-400/5 p-4">
                <div className="flex items-center gap-3">
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-cyan-400 to-violet-500 text-lg font-black text-[#06121f]">
                    {partner.username.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-base font-black">@{partner.username}</div>
                    <div className="text-xs text-slate-400">
                      {partner.planName ? <>on <b className="text-slate-200">{partner.planName} tier</b></> : "no tier selected yet"}
                    </div>
                  </div>
                </div>
                <div className="mono mt-3 break-all rounded-xl bg-black/40 p-2.5 text-[11px] text-emerald-300">{partner.wallet}</div>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <button className={btnPrimary} onClick={doRequest} disabled={requesting}>
                    {requesting ? "Sending…" : `Send pairing request · ${planById(planPick).name} $${planById(planPick).amount}`}
                  </button>
                  <button className={btnGhost} onClick={() => { setPartner(null); setPartnerWallet(""); }}>Not them — clear</button>
                </div>
              </div>
            )}
            <p className="mt-2 text-[11px] text-slate-600">Requesting only writes a record here and notifies them — settle everything outside the app.</p>
          </Card>
          <Card>
            <h2 className="text-lg font-black">What happens next?</h2>
            <ol className="mt-2 grid gap-2 text-xs leading-relaxed text-slate-400 md:grid-cols-4">
              <li className="rounded-xl bg-black/30 p-3"><b className="text-cyan-300">1 ·</b> You agree on a tier with your partner outside the app and get their wallet text.</li>
              <li className="rounded-xl bg-black/30 p-3"><b className="text-cyan-300">2 ·</b> You paste it here, confirm their profile, and send the request.</li>
              <li className="rounded-xl bg-black/30 p-3"><b className="text-cyan-300">3 ·</b> Your partner gets a note: <span className="italic">"@{me.username} sent you a pairing request."</span></li>
              <li className="rounded-xl bg-black/30 p-3"><b className="text-cyan-300">4 ·</b> They verify offline, press Acknowledge — both ledgers turn green.</li>
            </ol>
          </Card>
          <LedgerTable txns={sent.slice(0, 8)} me={me} title="Requests you sent" />
        </div>
      )}

      {!loading && tab === "ledger" && (
        <div className="rise mt-4 grid gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <button className={btnGhost} onClick={() => exportLedgerJSON(txns)}>⬇ Export my records (JSON)</button>
            <button className={btnGhost} onClick={refresh}>↻ Refresh</button>
            <span className="text-[11px] text-slate-600">Amber = waiting on the other side · Green = both sides confirmed</span>
          </div>
          <LedgerTable txns={txns} me={me} title="Your ledger — date · partner · tier · status" />
        </div>
      )}

      {!loading && tab === "alerts" && (
        <div className="rise mt-4 grid gap-4">
          <Card className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-black">Inbox</h2>
              <p className="text-xs text-slate-400">{unread ? `You have ${unread} unread note${unread > 1 ? "s" : ""} — your partners are waiting on you.` : "You're all caught up. New pairings will appear here."}</p>
            </div>
            <button className={btnGhost} onClick={async () => { await apiMarkAllRead(); refresh(); }}>Mark all read</button>
          </Card>
          {notifs.length === 0 && <Card><div className="text-sm text-slate-400">Nothing yet. When someone sends you a pairing request, you'll see it here with a confirm box.</div></Card>}
          {notifs.map((n) => {
            const txn = txns.find((t) => t.id === n.txnId);
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
                      <span className="text-slate-400">Record:</span>
                      <b>{txn.planName} ${txn.amount}</b>
                      <Badge status={txn.status} />
                      {txn.status === "completed" && <span className="text-emerald-300">· verified ${txn.verifiedAmount}</span>}
                    </div>
                    {isReceiver && txn.status !== "completed" ? (
                      <div className="mt-2.5">
                        <p className="mb-1.5 text-[11px] text-slate-500">Check your external wallet first — then pick the exact amount you received and confirm. This closes the record for both of you.</p>
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <select className={`${inputCls} sm:max-w-xs`} value={ackAmounts[txn.id] ?? ""} onChange={(e) => setAckAmounts((s) => ({ ...s, [txn.id]: e.target.value }))}>
                            <option value="">Amount I verified…</option>
                            {planAmounts().map((a) => <option key={a} value={a}>${a} — that's what arrived</option>)}
                          </select>
                          <button className={btnPrimary} onClick={() => doAck(txn.id)}>Acknowledge & confirm</button>
                        </div>
                      </div>
                    ) : isReceiver ? (
                      <div className="mt-2 text-xs text-emerald-300">✓ Confirmed by you — nicely done.</div>
                    ) : (
                      <div className="mt-2 text-xs text-slate-500">On @{txn.targetUsername} now — they'll confirm once they've verified offline.</div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {!loading && tab === "account" && (
        <div className="rise mt-4 grid gap-4 md:grid-cols-2">
          <Card>
            <h2 className="text-lg font-black">Profile</h2>
            <p className="text-xs text-slate-500">Your public face in the circle.</p>
            <div className="mt-3 space-y-3">
              <Field label="Username"><input className={inputCls} value={me.username} disabled /></Field>
              <Field label="Public wallet text" hint="Shown to partners when they pair with you. Text only — never a connection.">
                <textarea className={`${inputCls} mono min-h-[70px] text-xs`} defaultValue={me.wallet} id="walletEdit" />
              </Field>
              <button className={btnPrimary} onClick={async () => {
                const v = document.getElementById("walletEdit").value.trim();
                if (v.length < 10) return toast("That wallet text looks too short — 10+ characters needed.");
                const u = await apiUpdateProfile({ wallet: v });
                setMe(u); toast("Wallet text updated across the circle.");
              }}>Save changes</button>
            </div>
          </Card>
          <Card className="border-violet-400/25">
            <h2 className="text-lg font-black">Security</h2>
            <p className="text-xs text-slate-500">Your password was forged by the system at signup. Rotate it here whenever you like (min 8 characters).</p>
            <form onSubmit={doChangePassword} className="mt-3 space-y-3">
              <Field label="Current password">
                <input className={inputCls} type="password" value={pwForm.current} onChange={(e) => setPwForm({ ...pwForm, current: e.target.value })} autoComplete="current-password" />
              </Field>
              <Field label="New password">
                <input className={inputCls} type="password" value={pwForm.next} onChange={(e) => setPwForm({ ...pwForm, next: e.target.value })} autoComplete="new-password" />
              </Field>
              <Field label="Repeat new password">
                <input className={inputCls} type="password" value={pwForm.confirm} onChange={(e) => setPwForm({ ...pwForm, confirm: e.target.value })} autoComplete="new-password" />
              </Field>
              <button className={btnPrimary} type="submit">Update password</button>
            </form>
          </Card>
          <Card className="md:col-span-2">
            <h2 className="text-lg font-black">Get the app on your phone</h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              Add LedgerBook to your home screen for a fullscreen, app-like experience that keeps working even on patchy internet.
              iPhone: <b className="text-slate-200">Share → Add to Home Screen</b> ·
              Android: <b className="text-slate-200">⋮ → Install app / Add to Home screen</b>.
            </p>
            {installEvt
              ? <button className={`${btnPrimary} mt-3`} onClick={() => installEvt.prompt()}>⬇ Install LedgerBook</button>
              : <p className="mt-3 text-xs text-slate-500">An install button will appear here automatically when your browser is ready.</p>}
          </Card>
        </div>
      )}

      {receipt && (
        <RequestModal receipt={receipt} plan={planById(receipt.planId)} onClose={() => setReceipt(null)} toast={toast} />
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
              <th className="pb-2 pr-3">Tier</th>
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
                      {isSender ? "YOU PAIRED" : "PAIRED YOU"}
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
        {txns.length === 0 && <div className="py-6 text-center text-xs leading-relaxed text-slate-500">A blank page — the best time to start.<br />Head to Tiers & Pairing to log your first record.</div>}
      </div>
    </Card>
  );
}

/* ================= root ================= */
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
        <div className="grid min-h-screen place-items-center gap-3 text-sm text-slate-500">
          <div className="flex items-center gap-2.5"><Logo /><b className="text-slate-300">LedgerBook P2P</b></div>
        </div>
      ) : !me ? (
        <AuthScreen onAuthed={async () => setMe(await apiMe())} toast={toast} />
      ) : (
        <Dashboard me={me} setMe={setMe} toast={toast} />
      )}
      <footer className="mx-auto max-w-6xl px-4 pb-10 text-center">
        <div className="flex items-center justify-center gap-2 text-xs font-bold text-slate-400"><Logo size="h-6 w-6 text-xs" /> LedgerBook P2P · {BRAND_TAGLINE}</div>
        <div className="mt-1 text-[11px] text-slate-600">{DISCLAIMER}</div>
      </footer>
      <div className="fixed bottom-4 left-1/2 z-[60] flex w-full max-w-md -translate-x-1/2 flex-col gap-2 px-4">
        {toasts.map((t) => (
          <div key={t.id} className="glass rise rounded-2xl border-cyan-400/30 px-4 py-3 text-xs font-semibold text-cyan-100 shadow-2xl">{t.msg}</div>
        ))}
      </div>
    </div>
  );
}
