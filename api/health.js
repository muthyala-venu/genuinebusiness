import { send } from "./_lib/mongo.js";

// GET /api/health
export default async function handler(req, res) {
  const ok = Boolean(process.env.MONGODB_URI && process.env.JWT_SECRET);
  return send(res, 200, { ok, mongo: Boolean(process.env.MONGODB_URI), time: new Date().toISOString() });
}
