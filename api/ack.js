import { ObjectId } from "mongodb";
import { getDb, send, readJson } from "./_lib/mongo.js";
import { getAuthUser } from "./_lib/auth.js";

// POST /api/ack { txnId, verifiedAmount } — only the Target User can confirm
export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "Method not allowed" });
  try {
    const me = await getAuthUser(req);
    if (!me) return send(res, 401, { error: "Not authenticated." });
    if (me.blocked) return send(res, 403, { error: "This account has been blocked. Contact support." });
    const { txnId, verifiedAmount } = await readJson(req);
    const amt = Number(verifiedAmount);
    if (!amt || amt <= 0) return send(res, 400, { error: "Select the exact amount you verified receiving." });
    const db = await getDb();
    const txn = await db.collection("txns").findOne({ _id: new ObjectId(txnId) });
    if (!txn) return send(res, 404, { error: "Transaction not found." });
    if (txn.targetId !== String(me._id)) return send(res, 403, { error: "Only the Target User can acknowledge this entry." });
    if (txn.status === "completed") return send(res, 409, { error: "This entry is already completed." });
    const now = new Date().toISOString();
    await db.collection("txns").updateOne(
      { _id: txn._id },
      { $set: { status: "completed", verifiedAmount: amt, completedAt: now } }
    );
    await db.collection("notifs").insertOne({
      userId: txn.senderId,
      txnId: String(txn._id),
      text: `User ${txn.targetUsername} acknowledged & confirmed your ${txn.planName} entry (${amt}). Status: Completed.`,
      read: false,
      createdAt: now,
    });
    return send(res, 200, { ok: true });
  } catch (e) {
    return send(res, 500, { error: e.message || "Acknowledge failed" });
  }
}
