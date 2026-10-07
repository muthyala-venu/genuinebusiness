import { getDb, send, readJson, cleanUser } from "../_lib/mongo.js";
import { verifyPassword, signToken } from "../_lib/auth.js";

// POST /api/auth/login { username, password } -> { user, token }
export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "Method not allowed" });
  try {
    const { username, password } = await readJson(req);
    const db = await getDb();
    const u = await db.collection("users").findOne({ usernameLower: String(username || "").trim().toLowerCase() });
    if (!u) return send(res, 401, { error: "Invalid username or password." });
    const ok = await verifyPassword(String(password || ""), u.passwordHash);
    if (!ok) return send(res, 401, { error: "Invalid username or password." });
    const token = signToken(u._id);
    return send(res, 200, { user: cleanUser(u), token });
  } catch (e) {
    return send(res, 500, { error: e.message || "Login failed" });
  }
}
