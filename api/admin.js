import { ObjectId } from "mongodb";
import { getDb, send, readJson } from "./_lib/mongo.js";
import { getAuthUser, isAdmin } from "./_lib/auth.js";

// All admin ops in one function.
//   GET  /api/admin?action=users
//   GET  /api/admin?action=txns
//   POST /api/admin?action=complete  { txnId }
//   POST /api/admin?action=block     { userId, blocked }
export default async function handler(req, res) {
  const action = req.query?.action;
  try {
    const me = await getAuthUser(req);
    if (!me) return send(res, 401, { error: "Not authenticated." });
    if (!isAdmin(me)) return send(res, 403, { error: "Admins only." });
    const db = await getDb();

    if (action === "users" && req.method === "GET") {
      const docs = await db.collection("users").find({}).sort({ createdAt: -1 }).limit(1000).toArray();
      return send(res, 200, {
        users: docs.map((u) => ({
          id: String(u._id),
          username: u.usernameDisplay || u.username,
          wallet: u.wallet, plan: u.plan || null,
          role: u.role || "member", blocked: !!u.blocked, createdAt: u.createdAt,
        })),
      });
    }

    if (action === "txns" && req.method === "GET") {
      const docs = await db.collection("txns").find({}).sort({ createdAt: -1 }).limit(1000).toArray();
      return send(res, 200, { txns: docs.map((t) => ({ ...t, id: String(t._id), _id: undefined })) });
    }

    if (action === "complete" && req.method === "POST") {
      const { txnId } = await readJson(req);
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
    }

    if (action === "block" && req.method === "POST") {
      const { userId, blocked } = await readJson(req);
      const target = await db.collection("users").findOne({ _id: new ObjectId(userId) });
      if (!target) return send(res, 404, { error: "User not found." });
      if (isAdmin(target)) return send(res, 403, { error: "Admin accounts can't be blocked." });
      await db.collection("users").updateOne({ _id: target._id }, { $set: { blocked: !!blocked } });
      return send(res, 200, { ok: true });
    }

    return send(res, 404, { error: "Unknown admin action." });
  } catch (e) {
    return send(res, 500, { error: e.message || "Admin op failed" });
  }
}
