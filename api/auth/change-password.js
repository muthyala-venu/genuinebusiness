import { getDb, send, readJson } from "../_lib/mongo.js";
import { getAuthUser, verifyPassword, hashPassword } from "../_lib/auth.js";

// POST /api/auth/change-password { currentPassword, newPassword }
export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "Method not allowed" });
  try {
    const me = await getAuthUser(req);
    if (!me) return send(res, 401, { error: "Not authenticated." });
    if (me.blocked) return send(res, 403, { error: "This account has been blocked. Contact support." });
    const { currentPassword, newPassword } = await readJson(req);
    const ok = await verifyPassword(String(currentPassword || ""), me.passwordHash);
    if (!ok) return send(res, 401, { error: "Current password is incorrect." });
    if (String(newPassword || "").length < 8)
      return send(res, 400, { error: "New password must be at least 8 characters." });
    const db = await getDb();
    await db.collection("users").updateOne(
      { _id: me._id },
      { $set: { passwordHash: await hashPassword(String(newPassword)), mustChangePassword: false } }
    );
    return send(res, 200, { ok: true });
  } catch (e) {
    return send(res, 500, { error: e.message || "Change password failed" });
  }
}
