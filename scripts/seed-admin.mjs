// One-time admin seed. Run locally (never on Vercel):
//   MONGODB_URI="mongodb+srv://..." MONGODB_DB="ledgerbook_p2p" ADMIN_PASSWORD="..." node scripts/seed-admin.mjs
// Creates (or re-passwords) the fixed `admin` user with role=admin.
import bcrypt from "bcryptjs";
import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || "ledgerbook_p2p";
const password = process.env.ADMIN_PASSWORD;

if (!uri) {
  console.error("Missing MONGODB_URI env var.");
  process.exit(1);
}
if (!password || password.length < 8) {
  console.error("Set ADMIN_PASSWORD env var (min 8 chars).");
  process.exit(1);
}

const client = new MongoClient(uri);
await client.connect();
const db = client.db(dbName);
const now = new Date().toISOString();
const passwordHash = await bcrypt.hash(password, 10);

await db.collection("users").updateOne(
  { usernameLower: "admin" },
  {
    $set: {
      username: "admin",
      usernameDisplay: "admin",
      usernameLower: "admin",
      passwordHash,
      role: "admin",
      blocked: false,
    },
    $setOnInsert: {
      wallet: "TAdminCircleLedgerWallet000000001",
      plan: null,
      createdAt: now,
    },
  },
  { upsert: true }
);

console.log("Admin user 'admin' is ready. Log in with your ADMIN_PASSWORD, then change it under Account → Security.");
await client.close();
