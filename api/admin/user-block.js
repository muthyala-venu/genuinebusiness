import { ObjectId } from "mongodb";
import { getDb, send, readJson } from "../_lib/mongo.js";
import { getAuthUser, isAdmin } from "../_lib/auth.js";

// POST /api/admin/user-block { userId, blocked } — block/unblock a member (admin only)
export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "Method not allowed" });
  try {
    const me = await getAuthUser(req);
    if (!me) return send(res, 401, { error: "Not authenticated." });
    if (!isAdmin(me)) return send(res, 403, { error: "Admins only." });
    const { userId, blocked } = await readJson(req);
    const db = await getDb();
    const target = await db.collection("users").findOne({ _id: new ObjectId(userId) });
    if (!target) return send(res, 404, { error: "User not found." });
    if (isAdmin(target)) return send(res, 403, { error: "Admin accounts can't be blocked." });
    await db.collection("users").updateOne({ _id: target._id }, { $set: { blocked: !!blocked } });
    return send(res, 200, { ok: true });
  } catch (e) {
    return send(res, 500, { error: e.message || "Block failed" });
  }
}
