import { ObjectId } from "mongodb";
import { getDb, send, readJson } from "./_lib/mongo.js";
import { getAuthUser, isAdmin } from "./_lib/auth.js";

// All admin ops in one function.
//   GET  /api/admin?action=users
//   GET  /api/admin?action=txns
//   POST /api/admin?action=complete  { txnId }
//   POST /api/admin?action=block     { userId, blocked }
//   POST /api/admin?action=distribute { schemeId? } — one click: today's coins to every
//     member (or one scheme). Idempotent per day: already-run schemes are skipped.
export default async function handler(req, res) {
  const action = req.query?.action;
  try {
    const me = await getAuthUser(req);
    if (!me) return send(res, 401, { error: "Not authenticated." });
    if (!isAdmin(me)) return send(res, 403, { error: "Admins only." });
    const db = await getDb();

    if (action === "users" && req.method === "GET") {
      const docs = await db.collection("users").find({}).sort({ createdAt: -1 }).limit(1000).toArray();
      return send(res, 200, {
        users: docs.map((u) => ({
          id: String(u._id),
          username: u.usernameDisplay || u.username,
          wallet: u.wallet, plan: u.plan || null,
          role: u.role || "member", blocked: !!u.blocked, createdAt: u.createdAt,
        })),
      });
    }

    if (action === "txns" && req.method === "GET") {
      const docs = await db.collection("txns").find({}).sort({ createdAt: -1 }).limit(1000).toArray();
      return send(res, 200, { txns: docs.map((t) => ({ ...t, id: String(t._id), _id: undefined })) });
    }

    if (action === "complete" && req.method === "POST") {
      const { txnId } = await readJson(req);
      const txn = await db.collection("txns").findOne({ _id: new ObjectId(txnId) });
      if (!txn) return send(res, 404, { error: "Record not found." });
      if (txn.status === "completed") return send(res, 409, { error: "This record is already completed." });
      const now = new Date().toISOString();
      // Coin-priced record: settle coins too when the buyer still holds them.
      let coinNote = "";
      if (txn.schemeId && txn.coinAmount > 0) {
        const buyer = await db.collection("memberships").findOne({ schemeId: txn.schemeId, userId: txn.senderId });
        const seller = await db.collection("memberships").findOne({ schemeId: txn.schemeId, userId: txn.targetId });
        if (buyer && seller && buyer.balance >= txn.coinAmount) {
          await db.collection("memberships").updateOne({ _id: buyer._id }, { $inc: { balance: -txn.coinAmount } });
          await db.collection("memberships").updateOne({ _id: seller._id }, { $inc: { balance: txn.coinAmount } });
          await db.collection("coinlogs").insertMany([
            { userId: txn.senderId, schemeId: txn.schemeId, schemeName: txn.schemeName, kind: "spend", amount: -txn.coinAmount, balanceAfter: buyer.balance - txn.coinAmount, ref: String(txn._id), at: now },
            { userId: txn.targetId, schemeId: txn.schemeId, schemeName: txn.schemeName, kind: "earn", amount: txn.coinAmount, balanceAfter: seller.balance + txn.coinAmount, ref: String(txn._id), at: now },
          ]);
        } else {
          coinNote = " Coin settlement is pending — the buyer no longer holds enough coins.";
        }
        if (txn.offerId) {
          await db.collection("offers").updateOne(
            { _id: new ObjectId(txn.offerId) },
            { $set: { status: "closed", closedAt: now } }
          );
        }
      }
      await db.collection("txns").updateOne(
        { _id: txn._id },
        { $set: { status: "completed", verifiedAmount: txn.amount, completedAt: now, completedBy: "admin" } }
      );
      const note = `An admin marked your ${txn.planName} record (@${txn.senderUsername} ↔ @${txn.targetUsername}) as Completed.${coinNote}`;
      await db.collection("notifs").insertMany([
        { userId: txn.senderId, txnId: String(txn._id), text: note, read: false, createdAt: now },
        { userId: txn.targetId, txnId: String(txn._id), text: note, read: false, createdAt: now },
      ]);
      return send(res, 200, { ok: true });
    }

    if (action === "block" && req.method === "POST") {
      const { userId, blocked } = await readJson(req);
      const target = await db.collection("users").findOne({ _id: new ObjectId(userId) });
      if (!target) return send(res, 404, { error: "User not found." });
      if (isAdmin(target)) return send(res, 403, { error: "Admin accounts can't be blocked." });
      await db.collection("users").updateOne({ _id: target._id }, { $set: { blocked: !!blocked } });
      return send(res, 200, { ok: true });
    }

    if (action === "distribute" && req.method === "POST") {
      const { schemeId } = await readJson(req);
      const today = new Date().toISOString().slice(0, 10);
      const schemes = schemeId
        ? await db.collection("schemes").find({ _id: new ObjectId(schemeId), status: "active" }).toArray()
        : await db.collection("schemes").find({ status: "active" }).toArray();
      const sent = [];
      const skipped = [];
      for (const scheme of schemes) {
        const sid = String(scheme._id);
        if (scheme.lastDistributedAt && String(scheme.lastDistributedAt).slice(0, 10) === today) {
          skipped.push({ schemeId: sid, name: scheme.name, reason: "already sent today" });
          continue;
        }
        const members = await db.collection("memberships").find({ schemeId: sid }).toArray();
        if (members.length === 0) {
          await db.collection("schemes").updateOne({ _id: scheme._id }, { $set: { lastDistributedAt: today } });
          skipped.push({ schemeId: sid, name: scheme.name, reason: "no members" });
          continue;
        }
        const now = new Date().toISOString();
        const bulk = db.collection("memberships").initializeUnorderedBulkOp();
        for (const m of members) bulk.find({ _id: m._id }).updateOne({ $inc: { balance: scheme.dailyCoins } });
        await bulk.execute();
        await db.collection("coinlogs").insertMany(
          members.map((m) => ({
            userId: m.userId, schemeId: sid, schemeName: scheme.name,
            kind: "distribute", amount: scheme.dailyCoins, balanceAfter: m.balance + scheme.dailyCoins,
            ref: today, at: now,
          }))
        );
        await db.collection("notifs").insertMany(
          members.map((m) => ({
            userId: m.userId, txnId: null,
            text: `Today's coins deposited: +${scheme.dailyCoins} ${scheme.name} coins. Your balance grew — spend them on lots or hold.`,
            read: false, createdAt: now,
          }))
        );
        await db.collection("schemes").updateOne({ _id: scheme._id }, { $set: { lastDistributedAt: today } });
        sent.push({ schemeId: sid, name: scheme.name, members: members.length, perUser: scheme.dailyCoins, total: members.length * scheme.dailyCoins });
      }
      return send(res, 200, { sent, skipped });
    }

    return send(res, 404, { error: "Unknown admin action." });
  } catch (e) {
    return send(res, 500, { error: "Admin op failed" });
  }
}
