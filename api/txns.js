import { getDb, send } from "./_lib/mongo.js";
import { getAuthUser } from "./_lib/auth.js";

// GET /api/txns -> { txns }
export default async function handler(req, res) {
  if (req.method !== "GET") return send(res, 405, { error: "Method not allowed" });
  try {
    const me = await getAuthUser(req);
    if (!me) return send(res, 401, { error: "Not authenticated." });
    const id = String(me._id);
    const db = await getDb();
    const docs = await db.collection("txns")
      .find({ $or: [{ senderId: id }, { targetId: id }] })
      .sort({ createdAt: -1 }).limit(200).toArray();
    return send(res, 200, { txns: docs.map((t) => ({ ...t, id: String(t._id), _id: undefined })) });
  } catch (e) {
    return send(res, 500, { error: e.message || "Failed to load ledger" });
  }
}
