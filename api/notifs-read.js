import { ObjectId } from "mongodb";
import { getDb, send, readJson } from "./_lib/mongo.js";
import { getAuthUser } from "./_lib/auth.js";

// POST /api/notifs-read { notifId? | all?: true }
export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "Method not allowed" });
  try {
    const me = await getAuthUser(req);
    if (!me) return send(res, 401, { error: "Not authenticated." });
    const { notifId, all } = await readJson(req);
    const db = await getDb();
    const uid = String(me._id);
    if (all) {
      await db.collection("notifs").updateMany({ userId: uid }, { $set: { read: true } });
    } else if (notifId) {
      await db.collection("notifs").updateOne(
        { _id: new ObjectId(notifId), userId: uid }, { $set: { read: true } }
      );
    }
    return send(res, 200, { ok: true });
  } catch (e) {
    return send(res, 500, { error: e.message || "Failed" });
  }
}
