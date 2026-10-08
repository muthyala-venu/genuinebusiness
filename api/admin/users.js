import { getDb, send } from "../_lib/mongo.js";
import { getAuthUser, isAdmin } from "../_lib/auth.js";

// GET /api/admin/users — full member list (admin only, no password hashes)
export default async function handler(req, res) {
  if (req.method !== "GET") return send(res, 405, { error: "Method not allowed" });
  try {
    const me = await getAuthUser(req);
    if (!me) return send(res, 401, { error: "Not authenticated." });
    if (!isAdmin(me)) return send(res, 403, { error: "Admins only." });
    const db = await getDb();
    const docs = await db.collection("users").find({}).sort({ createdAt: -1 }).limit(1000).toArray();
    return send(res, 200, {
      users: docs.map((u) => ({
        id: String(u._id),
        username: u.usernameDisplay || u.username,
        wallet: u.wallet,
        plan: u.plan || null,
        role: u.role || "member",
        blocked: !!u.blocked,
        createdAt: u.createdAt,
      })),
    });
  } catch (e) {
    return send(res, 500, { error: e.message || "Failed to load users" });
  }
}
