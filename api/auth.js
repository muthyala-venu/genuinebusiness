import { getDb, send, readJson, cleanUser } from "./_lib/mongo.js";
import { generatePassword, hashPassword, verifyPassword, signToken, getAuthUser } from "./_lib/auth.js";

// All auth in one function (Vercel Hobby = max 12 functions).
//   POST /api/auth?action=signup          { username, wallet } -> { user, generatedPassword, token }
//   POST /api/auth?action=login           { username, password } -> { user, token }
//   GET  /api/auth?action=me             (Bearer token) -> { user }
//   POST /api/auth?action=change-password { currentPassword, newPassword }
export default async function handler(req, res) {
  const action = req.query?.action;
  try {
    if (action === "signup" && req.method === "POST") {
      const { username, wallet } = await readJson(req);
      const name = String(username || "").trim();
      const wall = String(wallet || "").trim();
      if (name.length < 3) return send(res, 400, { error: "Username must be at least 3 characters." });
      if (!/^[a-zA-Z0-9_.-]+$/.test(name)) return send(res, 400, { error: "Username may only contain letters, numbers, _, . or -." });
      if (name.toLowerCase() === "admin") return send(res, 400, { error: "That username is reserved. Pick another one." });
      if (wall.length < 10 || wall.length > 200) return send(res, 400, { error: "Paste your public Trust Wallet address text string (10–200 chars)." });
      const db = await getDb();
      if (await db.collection("users").findOne({ usernameLower: name.toLowerCase() }))
        return send(res, 409, { error: "That username is already taken. Pick a unique username." });
      if (await db.collection("users").findOne({ wallet: wall }))
        return send(res, 409, { error: "That wallet text is already registered to another member." });
      const generatedPassword = generatePassword(12);
      const doc = {
        username: name, usernameDisplay: name, usernameLower: name.toLowerCase(),
        passwordHash: await hashPassword(generatedPassword),
        wallet: wall, plan: null, role: "member", blocked: false,
        createdAt: new Date().toISOString(),
      };
      const r = await db.collection("users").insertOne(doc);
      return send(res, 200, {
        user: cleanUser({ ...doc, _id: r.insertedId }),
        generatedPassword,
        token: signToken(r.insertedId),
      });
    }

    if (action === "login" && req.method === "POST") {
      const { username, password } = await readJson(req);
      const db = await getDb();
      const u = await db.collection("users").findOne({ usernameLower: String(username || "").trim().toLowerCase() });
      if (!u) return send(res, 401, { error: "Invalid username or password." });
      if (!(await verifyPassword(String(password || ""), u.passwordHash)))
        return send(res, 401, { error: "Invalid username or password." });
      if (u.blocked) return send(res, 403, { error: "This account has been blocked. Contact support." });
      return send(res, 200, { user: cleanUser(u), token: signToken(u._id) });
    }

    if (action === "me" && req.method === "GET") {
      const u = await getAuthUser(req);
      if (!u) return send(res, 401, { error: "Not authenticated." });
      return send(res, 200, { user: cleanUser(u) });
    }

    if (action === "change-password" && req.method === "POST") {
      const me = await getAuthUser(req);
      if (!me) return send(res, 401, { error: "Not authenticated." });
      if (me.blocked) return send(res, 403, { error: "This account has been blocked. Contact support." });
      const { currentPassword, newPassword } = await readJson(req);
      if (!(await verifyPassword(String(currentPassword || ""), me.passwordHash)))
        return send(res, 401, { error: "Current password is incorrect." });
      if (String(newPassword || "").length < 8)
        return send(res, 400, { error: "New password must be at least 8 characters." });
      const db = await getDb();
      await db.collection("users").updateOne({ _id: me._id }, { $set: { passwordHash: await hashPassword(String(newPassword)) } });
      return send(res, 200, { ok: true });
    }

    return send(res, 404, { error: "Unknown auth action." });
  } catch (e) {
    return send(res, 500, { error: "Auth failed" });
  }
}
