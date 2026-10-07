import { getDb, send, readJson, cleanUser } from "./_lib/mongo.js";
import { getAuthUser } from "./_lib/auth.js";

export const PLANS = [
  { id: "starter", name: "Starter Tier", amount: 50 },
  { id: "bronze", name: "Bronze Tier", amount: 150 },
  { id: "silver", name: "Silver Tier", amount: 350 },
  { id: "gold", name: "Gold Tier", amount: 750 },
  { id: "platinum", name: "Platinum Tier", amount: 1500 },
];

// POST /api/deposit { planId } -> { txn, target }
export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "Method not allowed" });
  try {
    const me = await getAuthUser(req);
    if (!me) return send(res, 401, { error: "Not authenticated." });
    const { planId } = await readJson(req);
    const plan = PLANS.find((p) => p.id === planId);
    if (!plan) return send(res, 400, { error: "Select a valid plan tier." });

    const db = await getDb();
    if (me.plan !== planId) {
      await db.collection("users").updateOne({ _id: me._id }, { $set: { plan: planId } });
      me.plan = planId;
    }

    const others = await db.collection("users").find({ _id: { $ne: me._id } }).toArray();
    if (others.length === 0)
      return send(res, 409, { error: "No other users in the ledger yet. Ask a friend to sign up so matching can find a Target User." });

    const samePlan = others.filter((u) => u.plan === planId);
    const pool = samePlan.length > 0 ? samePlan : others;
    const prior = await db.collection("txns")
      .find({ senderId: String(me._id), planId })
      .sort({ createdAt: -1 }).limit(20).toArray();
    const lastTarget = prior[0]?.targetId;
    const candidates = pool.filter((u) => String(u._id) !== lastTarget);
    const pickFrom = candidates.length > 0 ? candidates : pool;
    const target = pickFrom[prior.length % pickFrom.length];

    const now = new Date().toISOString();
    const senderId = String(me._id);
    const targetId = String(target._id);
    const txnDoc = {
      senderId,
      senderUsername: me.usernameDisplay || me.username,
      targetId,
      targetUsername: target.usernameDisplay || target.username,
      targetWalletSnapshot: target.wallet,
      planId: plan.id,
      planName: plan.name,
      amount: plan.amount,
      status: "awaiting_confirmation",
      copyLoggedAt: now,
      createdAt: now,
      completedAt: null,
      verifiedAmount: null,
    };
    const r = await db.collection("txns").insertOne(txnDoc);
    await db.collection("copylogs").insertOne({ senderId, targetId, planId: plan.id, at: now });
    await db.collection("notifs").insertOne({
      userId: targetId,
      txnId: String(r.insertedId),
      text: `User ${me.usernameDisplay || me.username} has copied your wallet address for the ${plan.name} tier.`,
      read: false,
      createdAt: now,
    });

    return send(res, 200, {
      txn: { id: String(r.insertedId), ...txnDoc },
      target: cleanUser(target),
    });
  } catch (e) {
    return send(res, 500, { error: e.message || "Deposit failed" });
  }
}
