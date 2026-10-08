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

// Manual pairing + open-offers board in one function.
//   POST /api/pairing?action=lookup        { wallet } -> { partner }
//   POST /api/pairing?action=request       { planId, targetWallet } -> { txn, target }
//   GET  /api/pairing?action=offers        -> { offers } (open lots + your own)
//   POST /api/pairing?action=offer-create  { side: sell|buy, planId, note? } -> { offer }
//   POST /api/pairing?action=offer-close   { offerId }
//   POST /api/pairing?action=offer-interest { offerId } (notifies the poster)
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
      const { planId, targetWallet } = await readJson(req);
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
      const now = new Date().toISOString();
      const senderId = String(me._id);
      const targetId = String(target._id);
      const txnDoc = {
        senderId,
        senderUsername: me.usernameDisplay || me.username,
        targetId,
        targetUsername: target.usernameDisplay || target.username,
        targetWalletSnapshot: target.wallet,
        planId: plan.id, planName: plan.name, amount: plan.amount,
        status: "awaiting_confirmation",
        copyLoggedAt: now, createdAt: now, completedAt: null, verifiedAmount: null,
      };
      const r = await db.collection("txns").insertOne(txnDoc);
      await db.collection("copylogs").insertOne({ senderId, targetId, planId: plan.id, at: now });
      await db.collection("notifs").insertOne({
        userId: targetId,
        txnId: String(r.insertedId),
        text: `User ${me.usernameDisplay || me.username} sent you a pairing request for the ${plan.name} tier.`,
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
      const { side, planId, note } = await readJson(req);
      if (!["sell", "buy"].includes(side)) return send(res, 400, { error: "Choose whether this lot is open to sell or open to buy." });
      const plan = PLANS.find((p) => p.id === planId);
      if (!plan) return send(res, 400, { error: "Select a valid tier for this lot." });
      const cleanNote = String(note || "").trim().slice(0, 200);
      const doc = {
        userId: String(me._id),
        username: me.usernameDisplay || me.username,
        side, planId: plan.id, planName: plan.name, amount: plan.amount,
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

    return send(res, 404, { error: "Unknown pairing action." });
  } catch (e) {
    return send(res, 500, { error: "Pairing failed" });
  }
}
