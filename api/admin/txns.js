import { getDb, send } from "../_lib/mongo.js";
import { getAuthUser, isAdmin } from "../_lib/auth.js";

// GET /api/admin/txns — every pairing record across the circle (admin only)
export default async function handler(req, res) {
  if (req.method !== "GET") return send(res, 405, { error: "Method not allowed" });
  try {
    const me = await getAuthUser(req);
    if (!me) return send(res, 401, { error: "Not authenticated." });
    if (!isAdmin(me)) return send(res, 403, { error: "Admins only." });
    const db = await getDb();
    const docs = await db.collection("txns").find({}).sort({ createdAt: -1 }).limit(1000).toArray();
    return send(res, 200, { txns: docs.map((t) => ({ ...t, id: String(t._id), _id: undefined })) });
  } catch (e) {
    return send(res, 500, { error: e.message || "Failed to load transactions" });
  }
}
