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

// Manual pairing in one function.
//   POST /api/pairing?action=lookup  { wallet } -> { partner }
//   POST /api/pairing?action=request { planId, targetWallet } -> { txn, target }
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
      if (wall.length < 10) return send(res, 400, { error: "Paste your partner's full wallet text first." });
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
      if (wall.length < 10) return send(res, 400, { error: "Paste your partner's wallet text first." });
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

    return send(res, 404, { error: "Unknown pairing action." });
  } catch (e) {
    return send(res, 500, { error: e.message || "Pairing failed" });
  }
}
