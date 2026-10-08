import { MongoClient } from "mongodb";

let cachedClient = null;
let cachedDb = null;

export async function getDb() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set. Add it in Vercel env vars (and .env locally).");
  const dbName = process.env.MONGODB_DB || "ledgerbook_p2p";
  if (cachedDb) return cachedDb;
  if (!cachedClient) {
    cachedClient = new MongoClient(uri);
    await cachedClient.connect();
  }
  cachedDb = cachedClient.db(dbName);
  await cachedDb.collection("users").createIndex({ usernameLower: 1 }, { unique: true }).catch(() => {});
  await cachedDb.collection("txns").createIndex({ senderId: 1, createdAt: -1 }).catch(() => {});
  await cachedDb.collection("txns").createIndex({ targetId: 1, createdAt: -1 }).catch(() => {});
  await cachedDb.collection("notifs").createIndex({ userId: 1, createdAt: -1 }).catch(() => {});
  await cachedDb.collection("offers").createIndex({ status: 1, createdAt: -1 }).catch(() => {});
  await cachedDb.collection("memberships").createIndex({ schemeId: 1, userId: 1 }, { unique: true }).catch(() => {});
  await cachedDb.collection("coinlogs").createIndex({ userId: 1, at: -1 }).catch(() => {});
  return cachedDb;
}

export function send(res, status, body) {
  res.status(status).json(body);
}

export async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); }
    });
  });
}

export function cleanUser(u) {
  if (!u) return null;
  return {
    id: String(u._id),
    username: u.usernameDisplay || u.username,
    wallet: u.wallet,
    plan: u.plan || null,
    role: u.role || "member",
    blocked: !!u.blocked,
    createdAt: u.createdAt,
  };
}

export function cleanUserPublic(u) {
  if (!u) return null;
  return {
    id: String(u._id),
    username: u.usernameDisplay || u.username,
    wallet: u.wallet,
    plan: u.plan || null,
    createdAt: u.createdAt,
  };
}
