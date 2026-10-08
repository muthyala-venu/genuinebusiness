import { getDb, send, readJson } from "./_lib/mongo.js";
import { getAuthUser } from "./_lib/auth.js";

// Notifications in one function.
//   GET  /api/notifs            -> { notifs }
//   POST /api/notifs?action=read { notifId? | all?: true }
export default async function handler(req, res) {
  try {
    const me = await getAuthUser(req);
    if (!me) return send(res, 401, { error: "Not authenticated." });
    const db = await getDb();

    if (req.method === "GET") {
      const docs = await db.collection("notifs")
        .find({ userId: String(me._id) })
        .sort({ createdAt: -1 }).limit(200).toArray();
      return send(res, 200, { notifs: docs.map((n) => ({ ...n, id: String(n._id), _id: undefined })) });
    }

    if (req.query?.action === "read" && req.method === "POST") {
      const { ObjectId } = await import("mongodb");
      const { notifId, all } = await readJson(req);
      const uid = String(me._id);
      if (all) {
        await db.collection("notifs").updateMany({ userId: uid }, { $set: { read: true } });
      } else if (notifId) {
        await db.collection("notifs").updateOne(
          { _id: new ObjectId(notifId), userId: uid }, { $set: { read: true } }
        );
      }
      return send(res, 200, { ok: true });
    }

    return send(res, 404, { error: "Unknown notifications action." });
  } catch (e) {
    return send(res, 500, { error: e.message || "Failed to load notifications" });
  }
}
