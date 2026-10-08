import { getDb, send, readJson } from "./_lib/mongo.js";
import { getAuthUser } from "./_lib/auth.js";

const PLAN_NAMES = { starter: "Starter", bronze: "Bronze", silver: "Silver", gold: "Gold", platinum: "Platinum" };

// POST /api/partner/lookup { wallet } -> { partner }
// Manual pairing: the sender got this wallet text outside the app (WhatsApp etc.)
// and pastes it here. We resolve it to a member profile — no auto-matching.
export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "Method not allowed" });
  try {
    const me = await getAuthUser(req);
    if (!me) return send(res, 401, { error: "Not authenticated." });
    const { wallet } = await readJson(req);
    const wall = String(wallet || "").trim();
    if (wall.length < 10) return send(res, 400, { error: "Paste your partner's full wallet text first." });
    const db = await getDb();
    const target = await db.collection("users").findOne({ wallet: wall });
    if (!target) return send(res, 404, { error: "No member found with that wallet text. Check for extra spaces or ask your partner to re-send it." });
    if (String(target._id) === String(me._id))
      return send(res, 400, { error: "That's your own wallet text — paste your partner's instead." });
    return send(res, 200, {
      partner: {
        username: target.usernameDisplay || target.username,
        plan: target.plan || null,
        planName: target.plan ? (PLAN_NAMES[target.plan] || target.plan) : null,
        wallet: target.wallet,
      },
    });
  } catch (e) {
    return send(res, 500, { error: e.message || "Lookup failed" });
  }
}
