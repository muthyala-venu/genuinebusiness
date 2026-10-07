import { getDb, send, readJson, cleanUser } from "../_lib/mongo.js";
import { generatePassword, hashPassword, signToken } from "../_lib/auth.js";

// POST /api/auth/signup  { username, wallet } -> { user, generatedPassword, token }
// Username set by user. Password generated randomly by the system (shown once).
export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "Method not allowed" });
  try {
    const { username, wallet } = await readJson(req);
    const name = String(username || "").trim();
    const wall = String(wallet || "").trim();
    if (name.length < 3) return send(res, 400, { error: "Username must be at least 3 characters." });
    if (!/^[a-zA-Z0-9_.-]+$/.test(name)) return send(res, 400, { error: "Username may only contain letters, numbers, _, . or -." });
    if (wall.length < 10) return send(res, 400, { error: "Paste your public Trust Wallet address text string (min 10 chars)." });

    const db = await getDb();
    const exists = await db.collection("users").findOne({ usernameLower: name.toLowerCase() });
    if (exists) return send(res, 409, { error: "That username is already taken. Pick a unique username." });

    const generatedPassword = generatePassword(12);
    const passwordHash = await hashPassword(generatedPassword);
    const now = new Date().toISOString();
    const doc = {
      username: name,
      usernameDisplay: name,
      usernameLower: name.toLowerCase(),
      passwordHash,
      mustChangePassword: false,
      wallet: wall,
      plan: null,
      createdAt: now,
    };
    const r = await db.collection("users").insertOne(doc);
    const token = signToken(r.insertedId);
    return send(res, 200, {
      user: { ...cleanUser({ ...doc, _id: r.insertedId }), mustChangePassword: false },
      generatedPassword, // show once — user saves it, can change later in Account tab
      token,
    });
  } catch (e) {
    return send(res, 500, { error: e.message || "Signup failed" });
  }
}
