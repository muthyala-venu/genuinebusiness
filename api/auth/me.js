import { send, cleanUser } from "../_lib/mongo.js";
import { getAuthUser } from "../_lib/auth.js";

// GET /api/auth/me (Authorization: Bearer <token>)
export default async function handler(req, res) {
  if (req.method !== "GET") return send(res, 405, { error: "Method not allowed" });
  const u = await getAuthUser(req);
  if (!u) return send(res, 401, { error: "Not authenticated." });
  return send(res, 200, { user: cleanUser(u) });
}
