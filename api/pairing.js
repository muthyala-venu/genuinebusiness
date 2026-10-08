import { ObjectId } from "mongodb";
import { getDb, send, readJson } from "./_lib/mongo.js";
import { getAuthUser, isAdmin } from "./_lib/auth.js";

const PLAN_NAMES = { starter: "Starter", bronze: "Bronze", silver: "Silver", gold: "Gold", platinum: "Platinum" };
const PLANS = [
  { id: "starter", name: "Starter", amount: 50 },
  { id: "bronze", name: "Bronze", amount: 150 },
  { id: "silver", name: "Silver", amount: 350 },
  { id: "gold", name: "Gold", amount: 750 },
  { id: "platinum", name: "Platinum", amount: 1500 },
];

// Manual pairing + open-offers board + loyalty coins in one function.
//   POST /api/pairing?action=lookup        { wallet } -> { partner }
//   POST /api/pairing?action=request       { planId, targetWallet, offerId? } -> { txn, target }
//   GET  /api/pairing?action=offers        -> { offers } (open lots + your own)
//   POST /api/pairing?action=offer-create  { side: sell|buy, planId, note?, schemeId? } -> { offer }
//   POST /api/pairing?action=offer-close   { offerId }
//   POST /api/pairing?action=offer-interest { offerId } (notifies the poster)
//   GET  /api/pairing?action=schemes       -> { schemes } (active schemes + member counts)
//   POST /api/pairing?action=scheme-create { name, dailyCoins } -> { scheme }
//   POST /api/pairing?action=scheme-join   { schemeId }
//   POST /api/pairing?action=scheme-leave  { schemeId } (forfeits unspent coins in that scheme)
//   GET  /api/pairing?action=my-coins      -> { coins } (balances + claimable per scheme)
//   POST /api/pairing?action=collect       { schemeId } -> { credited, balance }
//   GET  /api/pairing?action=coin-history  -> { moves }
//
// Loyalty coins: internal record-keeping points (shown at 1 coin = 1 USDT).
// Members collect a daily allowance from schemes they joined and spend those
// coins on coin-priced lots. No real funds move anywhere in this app.
const DAY_MS = 86400000;
const MAX_ACCRUE_DAYS = 7;

function accrual(membership, dailyCoins, nowMs) {
  const elapsedDays = Math.floor((nowMs - new Date(membership.lastSettledAt).getTime()) / DAY_MS);
  const days = Math.max(0, Math.min(elapsedDays, MAX_ACCRUE_DAYS));
  return { days, credit: days * dailyCoins };
}
export default async function handler(req, res) {
  const action = req.query?.action;
  try {
    const me = await getAuthUser(req);
    if (!me) return send(res, 401, { error: "Not authenticated." });
    if (me.blocked) return send(res, 403, { error: "This account has been blocked. Contact support." });
    const db = await getDb();

    if (action === "lookup" && req.method === "POST") {
      const { wallet } = await readJson(req);
      const wall = String(wallet || "").trim();
      if (wall.length < 10 || wall.length > 200) return send(res, 400, { error: "Paste your partner's full wallet text first." });
      const target = await db.collection("users").findOne({ wallet: wall });
      if (!target) return send(res, 404, { error: "No member found with that wallet text. Check for extra spaces or ask your partner to re-send it." });
      if (String(target._id) === String(me._id))
        return send(res, 400, { error: "That's your own wallet text — paste your partner's instead." });
      return send(res, 200, {
        partner: {
          username: target.usernameDisplay || target.username,
          plan: target.plan || null,
          planName: target.plan ? (PLAN_NAMES[target.plan] || target.plan) : null,
          wallet: target.wallet,
        },
      });
    }

    if (action === "request" && req.method === "POST") {
      const { planId, targetWallet, offerId } = await readJson(req);
      const plan = PLANS.find((p) => p.id === planId);
      if (!plan) return send(res, 400, { error: "Select a valid tier first." });
      const wall = String(targetWallet || "").trim();
      if (wall.length < 10 || wall.length > 200) return send(res, 400, { error: "Paste your partner's wallet text first." });
      if (me.plan !== planId) {
        await db.collection("users").updateOne({ _id: me._id }, { $set: { plan: planId } });
        me.plan = planId;
      }
      const target = await db.collection("users").findOne({ wallet: wall });
      if (!target)
        return send(res, 404, { error: "No member found with that wallet text. Check for extra spaces or ask your partner to re-send it." });
      if (String(target._id) === String(me._id))
        return send(res, 400, { error: "That's your own wallet text — paste your partner's instead." });
      // Optional: tie the request to a Market lot (coin-priced or record-only).
      const senderId = String(me._id);
      const targetId = String(target._id);
      let schemeId = null, coinAmount = 0, linkedOfferId = null, schemeName = null;
      if (offerId) {
        const offer = await db.collection("offers").findOne({ _id: new ObjectId(offerId) });
        if (!offer || offer.status !== "open") return send(res, 404, { error: "That lot is no longer open." });
        if (offer.userId !== targetId)
          return send(res, 400, { error: "That wallet doesn't belong to the lot poster — double-check the address." });
        if (offer.planId !== plan.id)
          return send(res, 400, { error: "Tier mismatch — pick the tier shown on the lot." });
        linkedOfferId = String(offer._id);
        const dupPending = await db.collection("txns").findOne({
          offerId: linkedOfferId, senderId, status: "awaiting_confirmation",
        });
        if (dupPending) return send(res, 409, { error: "You already have a pending request on this lot — wait for it to complete first." });
        if (offer.schemeId) {
          const membership = await db.collection("memberships").findOne({ schemeId: offer.schemeId, userId: senderId });
          if (!membership) return send(res, 403, { error: "Join that coin scheme first — this lot is priced in its coins." });
          if (membership.balance < offer.coinAmount)
            return send(res, 403, { error: `You hold ${membership.balance} ${offer.schemeName} coins but this lot costs ${offer.coinAmount}. Collect your daily coins first.` });
          schemeId = offer.schemeId;
          schemeName = offer.schemeName;
          coinAmount = offer.coinAmount;
        }
      }
      const now = new Date().toISOString();
      const txnDoc = {
        senderId,
        senderUsername: me.usernameDisplay || me.username,
        targetId,
        targetUsername: target.usernameDisplay || target.username,
        targetWalletSnapshot: target.wallet,
        planId: plan.id, planName: plan.name, amount: plan.amount,
        status: "awaiting_confirmation",
        schemeId, schemeName, coinAmount, offerId: linkedOfferId,
        copyLoggedAt: now, createdAt: now, completedAt: null, verifiedAmount: null,
      };
      const r = await db.collection("txns").insertOne(txnDoc);
      await db.collection("copylogs").insertOne({ senderId, targetId, planId: plan.id, at: now });
      await db.collection("notifs").insertOne({
        userId: targetId,
        txnId: String(r.insertedId),
        text: schemeId
          ? `User ${me.usernameDisplay || me.username} sent you a pairing request for the ${plan.name} tier (${coinAmount} ${schemeName} coins).`
          : `User ${me.usernameDisplay || me.username} sent you a pairing request for the ${plan.name} tier.`,
        read: false, createdAt: now,
      });
      const t = target;
      return send(res, 200, {
        txn: { id: String(r.insertedId), ...txnDoc },
        target: { id: targetId, username: t.usernameDisplay || t.username, wallet: t.wallet, plan: t.plan || null, createdAt: t.createdAt },
      });
    }

    if (action === "offers" && req.method === "GET") {
      const docs = await db.collection("offers").find({
        $or: [{ status: "open" }, { userId: String(me._id) }],
      }).sort({ createdAt: -1 }).limit(200).toArray();
      return send(res, 200, { offers: docs.map((o) => ({ ...o, id: String(o._id), _id: undefined })) });
    }

    if (action === "offer-create" && req.method === "POST") {
      const { side, planId, note, schemeId } = await readJson(req);
      if (!["sell", "buy"].includes(side)) return send(res, 400, { error: "Choose whether this lot is open to sell or open to buy." });
      const plan = PLANS.find((p) => p.id === planId);
      if (!plan) return send(res, 400, { error: "Select a valid tier for this lot." });
      const cleanNote = String(note || "").trim().slice(0, 200);
      // Optional: price the lot in a scheme's loyalty coins (poster must hold membership there).
      let coinSchemeId = null, schemeName = null, coinAmount = 0;
      if (schemeId) {
        const scheme = await db.collection("schemes").findOne({ _id: new ObjectId(schemeId), status: "active" });
        if (!scheme) return send(res, 404, { error: "That coin scheme is no longer active." });
        const membership = await db.collection("memberships").findOne({ schemeId: String(scheme._id), userId: String(me._id) });
        if (!membership) return send(res, 403, { error: "Join that coin scheme first — then price lots in its coins." });
        coinSchemeId = String(scheme._id);
        schemeName = scheme.name;
        coinAmount = plan.amount;
      }
      const doc = {
        userId: String(me._id),
        username: me.usernameDisplay || me.username,
        side, planId: plan.id, planName: plan.name, amount: plan.amount,
        schemeId: coinSchemeId, schemeName, coinAmount,
        note: cleanNote, status: "open",
        createdAt: new Date().toISOString(), closedAt: null,
      };
      const r = await db.collection("offers").insertOne(doc);
      return send(res, 200, { offer: { id: String(r.insertedId), ...doc } });
    }

    if (action === "offer-close" && req.method === "POST") {
      const { offerId } = await readJson(req);
      const offer = await db.collection("offers").findOne({ _id: new ObjectId(offerId) });
      if (!offer) return send(res, 404, { error: "Lot not found." });
      if (offer.userId !== String(me._id)) return send(res, 403, { error: "Only the poster can close this lot." });
      await db.collection("offers").updateOne({ _id: offer._id }, { $set: { status: "closed", closedAt: new Date().toISOString() } });
      return send(res, 200, { ok: true });
    }

    if (action === "offer-interest" && req.method === "POST") {
      const { offerId } = await readJson(req);
      const offer = await db.collection("offers").findOne({ _id: new ObjectId(offerId) });
      if (!offer || offer.status !== "open") return send(res, 404, { error: "That lot is no longer open." });
      if (offer.userId === String(me._id)) return send(res, 400, { error: "That's your own lot." });
      if ((offer.interested || []).includes(String(me._id)))
        return send(res, 409, { error: "You've already shown interest in this lot — the poster has been notified." });
      await db.collection("offers").updateOne(
        { _id: offer._id }, { $addToSet: { interested: String(me._id) } }
      );
      await db.collection("notifs").insertOne({
        userId: offer.userId,
        txnId: null,
        text: `User ${me.usernameDisplay || me.username} is interested in your lot (${offer.side === "sell" ? "open to sell" : "open to buy"} · ${offer.planName} $${offer.amount}). Share your wallet text with them outside the app to pair.`,
        read: false,
        createdAt: new Date().toISOString(),
      });
      return send(res, 200, { ok: true });
    }

    if (action === "schemes" && req.method === "GET") {
      const schemes = await db.collection("schemes").find({ status: "active" }).sort({ createdAt: -1 }).limit(200).toArray();
      const counts = await db.collection("memberships").aggregate([
        { $group: { _id: "$schemeId", n: { $sum: 1 } } },
      ]).toArray();
      const byId = Object.fromEntries(counts.map((c) => [c._id, c.n]));
      const mine = new Set(
        (await db.collection("memberships").find({ userId: String(me._id) }).toArray()).map((m) => m.schemeId)
      );
      return send(res, 200, {
        schemes: schemes.map((s) => ({
          id: String(s._id), name: s.name, dailyCoins: s.dailyCoins,
          ownerId: s.ownerId, ownerUsername: s.ownerUsername,
          members: byId[String(s._id)] || 0,
          mine: mine.has(String(s._id)),
          createdAt: s.createdAt,
        })),
      });
    }

    if (action === "scheme-create" && req.method === "POST") {
      const { name, dailyCoins } = await readJson(req);
      const cleanName = String(name || "").trim().slice(0, 40);
      if (cleanName.length < 3) return send(res, 400, { error: "Give your scheme a name (3–40 characters)." });
      const rate = Math.floor(Number(dailyCoins));
      if (!rate || rate < 1 || rate > 1000) return send(res, 400, { error: "Daily coins must be between 1 and 1000." });
      const now = new Date().toISOString();
      const r = await db.collection("schemes").insertOne({
        ownerId: String(me._id),
        ownerUsername: me.usernameDisplay || me.username,
        name: cleanName, dailyCoins: rate, status: "active", createdAt: now,
      });
      const sid = String(r.insertedId);
      await db.collection("memberships").insertOne({
        schemeId: sid, userId: String(me._id), balance: 0,
        lastSettledAt: now, joinedAt: now,
      });
      return send(res, 200, { scheme: { id: sid, name: cleanName, dailyCoins: rate } });
    }

    if (action === "scheme-join" && req.method === "POST") {
      const { schemeId } = await readJson(req);
      const scheme = await db.collection("schemes").findOne({ _id: new ObjectId(schemeId), status: "active" });
      if (!scheme) return send(res, 404, { error: "That scheme is no longer active." });
      const sid = String(scheme._id);
      const existing = await db.collection("memberships").findOne({ schemeId: sid, userId: String(me._id) });
      if (existing) return send(res, 409, { error: "You're already in this scheme — collect your daily coins." });
      const now = new Date().toISOString();
      await db.collection("memberships").insertOne({
        schemeId: sid, userId: String(me._id), balance: 0,
        lastSettledAt: now, joinedAt: now,
      });
      return send(res, 200, { ok: true });
    }

    if (action === "scheme-leave" && req.method === "POST") {
      const { schemeId } = await readJson(req);
      const del = await db.collection("memberships").deleteOne({ schemeId: String(schemeId), userId: String(me._id) });
      if (!del.deletedCount) return send(res, 404, { error: "You're not in this scheme." });
      return send(res, 200, { ok: true, note: "Unspent coins in this scheme were forfeited." });
    }

    if (action === "my-coins" && req.method === "GET") {
      const memberships = await db.collection("memberships").find({ userId: String(me._id) }).toArray();
      const schemes = await db.collection("schemes").find({
        _id: { $in: memberships.map((m) => new ObjectId(m.schemeId)) },
      }).toArray();
      const byId = Object.fromEntries(schemes.map((s) => [String(s._id), s]));
      const nowMs = Date.now();
      const coins = memberships
        .filter((m) => byId[m.schemeId] && byId[m.schemeId].status === "active")
        .map((m) => {
          const s = byId[m.schemeId];
          const { days, credit } = accrual(m, s.dailyCoins, nowMs);
          return {
            schemeId: m.schemeId, schemeName: s.name, dailyCoins: s.dailyCoins,
            ownerUsername: s.ownerUsername, balance: m.balance,
            claimable: credit, claimableDays: days,
          };
        })
        .sort((a, b) => b.balance - a.balance);
      return send(res, 200, { coins });
    }

    if (action === "collect" && req.method === "POST") {
      const { schemeId } = await readJson(req);
      const m = await db.collection("memberships").findOne({ schemeId: String(schemeId), userId: String(me._id) });
      if (!m) return send(res, 404, { error: "Join this scheme first." });
      const scheme = await db.collection("schemes").findOne({ _id: new ObjectId(m.schemeId) });
      if (!scheme || scheme.status !== "active") return send(res, 404, { error: "That scheme is no longer active." });
      const nowMs = Date.now();
      const { days, credit } = accrual(m, scheme.dailyCoins, nowMs);
      if (!credit) return send(res, 200, { credited: 0, balance: m.balance, message: "Nothing to collect yet — come back tomorrow." });
      const newBalance = m.balance + credit;
      const newSettled = new Date(new Date(m.lastSettledAt).getTime() + days * DAY_MS).toISOString();
      await db.collection("memberships").updateOne(
        { _id: m._id }, { $set: { balance: newBalance, lastSettledAt: newSettled } }
      );
      const now = new Date().toISOString();
      await db.collection("coinlogs").insertOne({
        userId: String(me._id), schemeId: m.schemeId, schemeName: scheme.name,
        kind: "collect", amount: credit, balanceAfter: newBalance, ref: `${days}d`, at: now,
      });
      return send(res, 200, { credited: credit, balance: newBalance });
    }

    if (action === "coin-history" && req.method === "GET") {
      const docs = await db.collection("coinlogs").find({ userId: String(me._id) })
        .sort({ at: -1 }).limit(100).toArray();
      return send(res, 200, { moves: docs.map((d) => ({ ...d, id: String(d._id), _id: undefined })) });
    }

    return send(res, 404, { error: "Unknown pairing action." });
  } catch (e) {
    return send(res, 500, { error: "Pairing failed" });
  }
}
