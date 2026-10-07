import { getDb, send } from "./_lib/mongo.js";
import { getAuthUser } from "./_lib/auth.js";

// GET /api/notifs -> { notifs }
export default async function handler(req, res) {
  if (req.method !== "GET") return send(res, 405, { error: "Method not allowed" });
  try {
    const me = await getAuthUser(req);
    if (!me) return send(res, 401, { error: "Not authenticated." });
    const db = await getDb();
    const docs = await db.collection("notifs")
      .find({ userId: String(me._id) })
      .sort({ createdAt: -1 }).limit(200).toArray();
    return send(res, 200, { notifs: docs.map((n) => ({ ...n, id: String(n._id), _id: undefined })) });
  } catch (e) {
    return send(res, 500, { error: e.message || "Failed to load notifications" });
  }
}
