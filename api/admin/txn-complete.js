import { ObjectId } from "mongodb";
import { getDb, send, readJson } from "../_lib/mongo.js";
import { getAuthUser, isAdmin } from "../_lib/auth.js";

// POST /api/admin/txn-complete { txnId } — force a Pending entry to Completed (admin only)
export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "Method not allowed" });
  try {
    const me = await getAuthUser(req);
    if (!me) return send(res, 401, { error: "Not authenticated." });
    if (!isAdmin(me)) return send(res, 403, { error: "Admins only." });
    const { txnId } = await readJson(req);
    const db = await getDb();
    const txn = await db.collection("txns").findOne({ _id: new ObjectId(txnId) });
    if (!txn) return send(res, 404, { error: "Record not found." });
    if (txn.status === "completed") return send(res, 409, { error: "This record is already completed." });
    const now = new Date().toISOString();
    await db.collection("txns").updateOne(
      { _id: txn._id },
      { $set: { status: "completed", verifiedAmount: txn.amount, completedAt: now, completedBy: "admin" } }
    );
    const note = `An admin marked your ${txn.planName} record (@${txn.senderUsername} ↔ @${txn.targetUsername}) as Completed.`;
    await db.collection("notifs").insertMany([
      { userId: txn.senderId, txnId: String(txn._id), text: note, read: false, createdAt: now },
      { userId: txn.targetId, txnId: String(txn._id), text: note, read: false, createdAt: now },
    ]);
    return send(res, 200, { ok: true });
  } catch (e) {
    return send(res, 500, { error: e.message || "Force-complete failed" });
  }
}
