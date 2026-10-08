// Create one member with a system-style password. Run locally (never on Vercel):
//   MONGODB_URI="mongodb+srv://..." MONGODB_DB="ledgerbook_p2p" \
//   NEW_USERNAME="venu" NEW_WALLET="bc1q..." NEW_PASSWORD="..." node scripts/seed-user.mjs
import bcrypt from "bcryptjs";
import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || "ledgerbook_p2p";
const username = String(process.env.NEW_USERNAME || "").trim();
const wallet = String(process.env.NEW_WALLET || "").trim();
const password = process.env.NEW_PASSWORD;

if (!uri) {
  console.error("Missing MONGODB_URI env var.");
  process.exit(1);
}
if (username.length < 3 || !/^[a-zA-Z0-9_.-]+$/.test(username) || username.toLowerCase() === "admin") {
  console.error("Set a valid NEW_USERNAME (3+ chars, not reserved).");
  process.exit(1);
}
if (wallet.length < 10) {
  console.error("Set NEW_WALLET (min 10 chars).");
  process.exit(1);
}
if (!password || password.length < 8) {
  console.error("Set NEW_PASSWORD (min 8 chars).");
  process.exit(1);
}

const client = new MongoClient(uri);
await client.connect();
const db = client.db(dbName);

const exists = await db.collection("users").findOne({ usernameLower: username.toLowerCase() });
if (exists) {
  console.error(`Username '${username}' already exists — nothing created.`);
  await client.close();
  process.exit(1);
}
const walletTaken = await db.collection("users").findOne({ wallet });
if (walletTaken) {
  console.error("That wallet text is already registered to another member — nothing created.");
  await client.close();
  process.exit(1);
}

await db.collection("users").insertOne({
  username,
  usernameDisplay: username,
  usernameLower: username.toLowerCase(),
  passwordHash: await bcrypt.hash(password, 10),
  wallet,
  plan: null,
  role: "member",
  blocked: false,
  createdAt: new Date().toISOString(),
});

console.log(`Member '${username}' created.`);
await client.close();
