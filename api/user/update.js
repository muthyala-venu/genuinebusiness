import { getDb, send, readJson, cleanUser } from "../_lib/mongo.js";
import { getAuthUser } from "../_lib/auth.js";

const PLANS = ["starter", "bronze", "silver", "gold", "platinum"];

// POST /api/user/update { wallet?, plan? }
export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "Method not allowed" });
  try {
    const me = await getAuthUser(req);
    if (!me) return send(res, 401, { error: "Not authenticated." });
    const { wallet, plan } = await readJson(req);
    const patch = {};
    if (wallet !== undefined) {
      if (String(wallet).trim().length < 10) return send(res, 400, { error: "Wallet text must be at least 10 characters." });
      patch.wallet = String(wallet).trim();
    }
    if (plan !== undefined) {
      if (plan !== null && !PLANS.includes(plan)) return send(res, 400, { error: "Invalid plan." });
      patch.plan = plan;
    }
    const db = await getDb();
    await db.collection("users").updateOne({ _id: me._id }, { $set: patch });
    const u = await db.collection("users").findOne({ _id: me._id });
    return send(res, 200, { user: cleanUser(u) });
  } catch (e) {
    return send(res, 500, { error: e.message || "Update failed" });
  }
}
