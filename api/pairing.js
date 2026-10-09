import { ObjectId } from "mongodb";
import { getDb, send, readJson } from "./_lib/mongo.js";
import { getAuthUser, isAdmin } from "./_lib/auth.js";

const PLAN_NAMES = { starter: "Starter", bronze: "Bronze", silver: "Silver", gold: "Gold", platinum: "Platinum" };
const PLANS = [
  { id: "starter", name: "Starter", amount: 50 },
  { id: "bronze", name: "Bronze", amount: 150 },
  { id: "silver", name: "Silver", amount: 350 },
  { id: "gold", name: "Gold", amount: 750 },
  { id: "platinum", name: "Platinum", amount: 1500 },
];

// Manual pairing + open-offers board + loyalty coins in one function.
// Coins are internal record-keeping points (shown at 1 coin = 1 USDT).
// No real funds move anywhere in this app.
//
// Model: tiers ARE schemes. A member starts a scheme on a tier (entry price =
// tier amount, e.g. Bronze = 150). Others buy in: they pay the owner off-app,
// the owner approves the proposal here, and they become members entitled to
// daily coins. The admin runs one daily distribution (one click for all).
// Members redeem by selling coins openly or by direct request; coin moves are
// approved by the counterparty and written to the diary.
//
//   POST /api/pairing?action=lookup        { wallet } -> { partner }
//   POST /api/pairing?action=request       { planId, targetWallet, offerId? } -> { txn, target }
//   GET  /api/pairing?action=offers        -> { offers }
//   POST /api/pairing?action=offer-create  { kind: pair|coins, side, planId?, schemeId?, qty?, note? }
//   POST /api/pairing?action=offer-close   { offerId }
//   POST /api/pairing?action=offer-interest { offerId }
//   GET  /api/pairing?action=schemes       -> { schemes }
//   POST /api/pairing?action=scheme-create { name, tierId, dailyCoins }
//   POST /api/pairing?action=scheme-leave  { schemeId }
//   GET  /api/pairing?action=my-coins      -> { coins }
//   GET  /api/pairing?action=coin-history  -> { moves }
//   GET  /api/pairing?action=proposals     -> { proposals } (mine, as buyer or approver)
//   POST /api/pairing?action=propose       { kind: scheme|coins, schemeId?, offerId? }
//   POST /api/pairing?action=decide        { proposalId, approve: true|false }
export default async function handler(req, res) {
  const action = req.query?.action;
  try {
    const me = await getAuthUser(req);
    if (!me) return send(res, 401, { error: "Not authenticated." });
    if (me.blocked) return send(res, 403, { error: "This account has been blocked. Contact support." });
    const db = await getDb();

    if (action === "lookup" && req.method === "POST") {
      const { wallet } = await readJson(req);
      const wall = String(wallet || "").trim();
      if (wall.length < 10 || wall.length > 200) return send(res, 400, { error: "Paste your partner's full wallet text first." });
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
    }

    if (action === "request" && req.method === "POST") {
      const { planId, targetWallet, offerId } = await readJson(req);
      const plan = PLANS.find((p) => p.id === planId);
      if (!plan) return send(res, 400, { error: "Select a valid tier first." });
      const wall = String(targetWallet || "").trim();
      if (wall.length < 10 || wall.length > 200) return send(res, 400, { error: "Paste your partner's wallet text first." });
      if (me.plan !== planId) {
        await db.collection("users").updateOne({ _id: me._id }, { $set: { plan: planId } });
        me.plan = planId;
      }
      const target = await db.collection("users").findOne({ wallet: wall });
      if (!target)
        return send(res, 404, { error: "No member found with that wallet text. Check for extra spaces or ask your partner to re-send it." });
      if (String(target._id) === String(me._id))
        return send(res, 400, { error: "That's your own wallet text — paste your partner's instead." });
      // Optional: tie the request to a Market lot (coin-priced or record-only).
      const senderId = String(me._id);
      const targetId = String(target._id);
      let schemeId = null, coinAmount = 0, linkedOfferId = null, schemeName = null;
      if (offerId) {
        const offer = await db.collection("offers").findOne({ _id: new ObjectId(offerId) });
        if (!offer || offer.status !== "open") return send(res, 404, { error: "That lot is no longer open." });
        if (offer.kind === "coins")
          return send(res, 400, { error: "Coin lots trade through Buy/Sell requests on the lot — not through pairing." });
        if (offer.userId !== targetId)
          return send(res, 400, { error: "That wallet doesn't belong to the lot poster — double-check the address." });
        if (offer.planId !== plan.id)
          return send(res, 400, { error: "Tier mismatch — pick the tier shown on the lot." });
        linkedOfferId = String(offer._id);
        const dupPending = await db.collection("txns").findOne({
          offerId: linkedOfferId, senderId, status: "awaiting_confirmation",
        });
        if (dupPending) return send(res, 409, { error: "You already have a pending request on this lot — wait for it to complete first." });
        if (offer.schemeId) {
          const membership = await db.collection("memberships").findOne({ schemeId: offer.schemeId, userId: senderId });
          if (!membership) return send(res, 403, { error: "Join that coin scheme first — this lot is priced in its coins." });
          if (membership.balance < offer.coinAmount)
            return send(res, 403, { error: `You hold ${membership.balance} ${offer.schemeName} coins but this lot costs ${offer.coinAmount}. Collect your daily coins first.` });
          schemeId = offer.schemeId;
          schemeName = offer.schemeName;
          coinAmount = offer.coinAmount;
        }
      }
      const now = new Date().toISOString();
      const txnDoc = {
        senderId,
        senderUsername: me.usernameDisplay || me.username,
        targetId,
        targetUsername: target.usernameDisplay || target.username,
        targetWalletSnapshot: target.wallet,
        planId: plan.id, planName: plan.name, amount: plan.amount,
        status: "awaiting_confirmation",
        schemeId, schemeName, coinAmount, offerId: linkedOfferId,
        copyLoggedAt: now, createdAt: now, completedAt: null, verifiedAmount: null,
      };
      const r = await db.collection("txns").insertOne(txnDoc);
      await db.collection("copylogs").insertOne({ senderId, targetId, planId: plan.id, at: now });
      await db.collection("notifs").insertOne({
        userId: targetId,
        txnId: String(r.insertedId),
        text: schemeId
          ? `User ${me.usernameDisplay || me.username} sent you a pairing request for the ${plan.name} tier (${coinAmount} ${schemeName} coins).`
          : `User ${me.usernameDisplay || me.username} sent you a pairing request for the ${plan.name} tier.`,
        read: false, createdAt: now,
      });
      const t = target;
      return send(res, 200, {
        txn: { id: String(r.insertedId), ...txnDoc },
        target: { id: targetId, username: t.usernameDisplay || t.username, wallet: t.wallet, plan: t.plan || null, createdAt: t.createdAt },
      });
    }

    if (action === "offers" && req.method === "GET") {
      const docs = await db.collection("offers").find({
        $or: [{ status: "open" }, { userId: String(me._id) }],
      }).sort({ createdAt: -1 }).limit(200).toArray();
      return send(res, 200, { offers: docs.map((o) => ({ ...o, id: String(o._id), _id: undefined })) });
    }

    if (action === "offer-create" && req.method === "POST") {
      const { kind, side, planId, note, schemeId, qty } = await readJson(req);
      const lotKind = kind === "coins" ? "coins" : "pair";
      if (!["sell", "buy"].includes(side)) return send(res, 400, { error: "Choose whether this lot is open to sell or open to buy." });
      const cleanNote = String(note || "").trim().slice(0, 200);
      const now0 = new Date().toISOString();
      if (lotKind === "coins") {
        // Redeem market is sell-side only: members sell coins openly.
        // (Asking a specific user for a buyout is a direct request, not a lot.)
        if (side !== "sell")
          return send(res, 400, { error: "Coin lots are redeem listings — post them as open to sell, or send a direct buyout request instead." });
        const scheme = schemeId
          ? await db.collection("schemes").findOne({ _id: new ObjectId(schemeId), status: "active" })
          : null;
        if (!scheme) return send(res, 404, { error: "Pick an active coin scheme for this lot." });
        const amount = Math.floor(Number(qty));
        if (!amount || amount < 1 || amount > 1000000) return send(res, 400, { error: "Enter how many coins (1 or more)." });
        const membership = await db.collection("memberships").findOne({ schemeId: String(scheme._id), userId: String(me._id) });
        if (!membership) return send(res, 403, { error: "Join that coin scheme first — then trade its coins." });
        if (side === "sell" && membership.balance < amount)
          return send(res, 403, { error: `You hold ${membership.balance} ${scheme.name} coins — lower the quantity.` });
        const doc = {
          userId: String(me._id),
          username: me.usernameDisplay || me.username,
          kind: "coins", side, planId: null, planName: "Coin trade", amount,
          schemeId: String(scheme._id), schemeName: scheme.name, coinAmount: amount,
          note: cleanNote, status: "open",
          createdAt: now0, closedAt: null,
        };
        const r = await db.collection("offers").insertOne(doc);
        return send(res, 200, { offer: { id: String(r.insertedId), ...doc } });
      }
      const plan = PLANS.find((p) => p.id === planId);
      if (!plan) return send(res, 400, { error: "Select a valid tier for this lot." });
      // Optional: price the lot in a scheme's loyalty coins (poster must hold membership there).
      let coinSchemeId = null, schemeName = null, coinAmount = 0;
      if (schemeId) {
        const scheme = await db.collection("schemes").findOne({ _id: new ObjectId(schemeId), status: "active" });
        if (!scheme) return send(res, 404, { error: "That coin scheme is no longer active." });
        const membership = await db.collection("memberships").findOne({ schemeId: String(scheme._id), userId: String(me._id) });
        if (!membership) return send(res, 403, { error: "Join that coin scheme first — then price lots in its coins." });
        coinSchemeId = String(scheme._id);
        schemeName = scheme.name;
        coinAmount = plan.amount;
      }
      const doc = {
        userId: String(me._id),
        username: me.usernameDisplay || me.username,
        kind: "pair", side, planId: plan.id, planName: plan.name, amount: plan.amount,
        schemeId: coinSchemeId, schemeName, coinAmount,
        note: cleanNote, status: "open",
        createdAt: new Date().toISOString(), closedAt: null,
      };
      const r = await db.collection("offers").insertOne(doc);
      return send(res, 200, { offer: { id: String(r.insertedId), ...doc } });
    }

    if (action === "offer-close" && req.method === "POST") {
      const { offerId } = await readJson(req);
      const offer = await db.collection("offers").findOne({ _id: new ObjectId(offerId) });
      if (!offer) return send(res, 404, { error: "Lot not found." });
      if (offer.userId !== String(me._id)) return send(res, 403, { error: "Only the poster can close this lot." });
      await db.collection("offers").updateOne({ _id: offer._id }, { $set: { status: "closed", closedAt: new Date().toISOString() } });
      return send(res, 200, { ok: true });
    }

    if (action === "offer-interest" && req.method === "POST") {
      const { offerId } = await readJson(req);
      const offer = await db.collection("offers").findOne({ _id: new ObjectId(offerId) });
      if (!offer || offer.status !== "open") return send(res, 404, { error: "That lot is no longer open." });
      if (offer.userId === String(me._id)) return send(res, 400, { error: "That's your own lot." });
      if ((offer.interested || []).includes(String(me._id)))
        return send(res, 409, { error: "You've already shown interest in this lot — the poster has been notified." });
      await db.collection("offers").updateOne(
        { _id: offer._id }, { $addToSet: { interested: String(me._id) } }
      );
      await db.collection("notifs").insertOne({
        userId: offer.userId,
        txnId: null,
        text: `User ${me.usernameDisplay || me.username} is interested in your lot (${offer.side === "sell" ? "open to sell" : "open to buy"} · ${offer.planName} $${offer.amount}). Share your wallet text with them outside the app to pair.`,
        read: false,
        createdAt: new Date().toISOString(),
      });
      return send(res, 200, { ok: true });
    }

    if (action === "schemes" && req.method === "GET") {
      const schemes = await db.collection("schemes").find({ status: "active" }).sort({ createdAt: -1 }).limit(200).toArray();
      const counts = await db.collection("memberships").aggregate([
        { $group: { _id: "$schemeId", n: { $sum: 1 } } },
      ]).toArray();
      const byId = Object.fromEntries(counts.map((c) => [c._id, c.n]));
      const mine = new Set(
        (await db.collection("memberships").find({ userId: String(me._id) }).toArray()).map((m) => m.schemeId)
      );
      const myPending = new Set(
        (await db.collection("proposals").find({ kind: "scheme", buyerId: String(me._id), status: "pending" }).toArray()).map((p) => p.schemeId)
      );
      return send(res, 200, {
        schemes: schemes.map((s) => ({
          id: String(s._id), name: s.name, dailyCoins: s.dailyCoins,
          tierId: s.tierId, tierName: s.tierName, entryPrice: s.entryPrice,
          ownerId: s.ownerId, ownerUsername: s.ownerUsername,
          members: byId[String(s._id)] || 0,
          mine: mine.has(String(s._id)),
          pending: myPending.has(String(s._id)),
          distributedToday: s.lastDistributedAt ? String(s.lastDistributedAt).slice(0, 10) === new Date().toISOString().slice(0, 10) : false,
          createdAt: s.createdAt,
        })),
      });
    }

    if (action === "scheme-create" && req.method === "POST") {
      const { name, tierId, dailyCoins } = await readJson(req);
      const cleanName = String(name || "").trim().slice(0, 40);
      if (cleanName.length < 3) return send(res, 400, { error: "Give your scheme a name (3–40 characters)." });
      const tier = PLANS.find((p) => p.id === tierId);
      if (!tier) return send(res, 400, { error: "Pick which tier this scheme runs on — that sets its entry price." });
      const rate = Math.floor(Number(dailyCoins));
      if (!rate || rate < 1 || rate > 1000) return send(res, 400, { error: "Daily coins must be between 1 and 1000." });
      const now = new Date().toISOString();
      const r = await db.collection("schemes").insertOne({
        ownerId: String(me._id),
        ownerUsername: me.usernameDisplay || me.username,
        name: cleanName, tierId: tier.id, tierName: tier.name, entryPrice: tier.amount,
        dailyCoins: rate, status: "active",
        lastDistributedAt: null, createdAt: now,
      });
      const sid = String(r.insertedId);
      await db.collection("memberships").insertOne({
        schemeId: sid, userId: String(me._id), balance: 0,
        lastSettledAt: now, joinedAt: now,
      });
      return send(res, 200, { scheme: { id: sid, name: cleanName, tierName: tier.name, entryPrice: tier.amount, dailyCoins: rate } });
    }

    if (action === "scheme-leave" && req.method === "POST") {
      const { schemeId } = await readJson(req);
      const scheme = await db.collection("schemes").findOne({ _id: new ObjectId(schemeId) });
      if (scheme && scheme.ownerId === String(me._id))
        return send(res, 400, { error: "Owners can't leave their own scheme — members depend on its daily run." });
      const del = await db.collection("memberships").deleteOne({ schemeId: String(schemeId), userId: String(me._id) });
      if (!del.deletedCount) return send(res, 404, { error: "You're not in this scheme." });
      return send(res, 200, { ok: true, note: "Unspent coins in this scheme were forfeited." });
    }

    if (action === "my-coins" && req.method === "GET") {
      const memberships = await db.collection("memberships").find({ userId: String(me._id) }).toArray();
      const schemes = await db.collection("schemes").find({
        _id: { $in: memberships.map((m) => new ObjectId(m.schemeId)) },
      }).toArray();
      const byId = Object.fromEntries(schemes.map((s) => [String(s._id), s]));
      const today = new Date().toISOString().slice(0, 10);
      const todays = await db.collection("coinlogs").find({
        userId: String(me._id), kind: "distribute", at: { $gte: today },
      }).toArray();
      const depBy = {};
      for (const l of todays) depBy[l.schemeId] = (depBy[l.schemeId] || 0) + l.amount;
      const coins = memberships
        .filter((m) => byId[m.schemeId] && byId[m.schemeId].status === "active")
        .map((m) => {
          const s = byId[m.schemeId];
          return {
            schemeId: m.schemeId, schemeName: s.name, dailyCoins: s.dailyCoins,
            ownerUsername: s.ownerUsername, balance: m.balance,
            depositedToday: depBy[m.schemeId] || 0,
          };
        })
        .sort((a, b) => b.balance - a.balance);
      return send(res, 200, { coins });
    }

    if (action === "coin-history" && req.method === "GET") {
      const docs = await db.collection("coinlogs").find({ userId: String(me._id) })
        .sort({ at: -1 }).limit(100).toArray();
      return send(res, 200, { moves: docs.map((d) => ({ ...d, id: String(d._id), _id: undefined })) });
    }

    if (action === "proposals" && req.method === "GET") {
      const id = String(me._id);
      const docs = await db.collection("proposals").find({
        $or: [{ buyerId: id }, { ownerId: id }],
      }).sort({ createdAt: -1 }).limit(100).toArray();
      return send(res, 200, { proposals: docs.map((p) => ({ ...p, id: String(p._id), _id: undefined })) });
    }

    if (action === "propose" && req.method === "POST") {
      const { kind, schemeId, offerId } = await readJson(req);
      const now = new Date().toISOString();
      const myId = String(me._id);
      const myName = me.usernameDisplay || me.username;
      if (kind === "scheme") {
        const scheme = await db.collection("schemes").findOne({ _id: new ObjectId(schemeId), status: "active" });
        if (!scheme) return send(res, 404, { error: "That scheme is no longer active." });
        const sid = String(scheme._id);
        if (scheme.ownerId === myId) return send(res, 400, { error: "That's your own scheme." });
        if (await db.collection("memberships").findOne({ schemeId: sid, userId: myId }))
          return send(res, 409, { error: "You're already in this scheme." });
        if (await db.collection("proposals").findOne({ kind: "scheme", schemeId: sid, buyerId: myId, status: "pending" }))
          return send(res, 409, { error: "Your request is already with the owner — wait for approval." });
        await db.collection("proposals").insertOne({
          kind: "scheme", schemeId: sid, schemeName: scheme.name,
          tierId: scheme.tierId, tierName: scheme.tierName, amount: scheme.entryPrice,
          buyerId: myId, buyerUsername: myName,
          ownerId: scheme.ownerId, ownerUsername: scheme.ownerUsername,
          status: "pending", createdAt: now, decidedAt: null,
        });
        await db.collection("notifs").insertOne({
          userId: scheme.ownerId, txnId: null, proposalId: null,
          text: `User ${myName} wants to buy your ${scheme.tierName} scheme (“${scheme.name}”, $${scheme.entryPrice}). Verify their off-app payment, then approve.`,
          read: false, createdAt: now,
        });
        return send(res, 200, { ok: true, message: `Request sent — pay $${scheme.entryPrice} to @${scheme.ownerUsername} outside the app, then they approve you here.` });
      }
      if (kind === "coins") {
        const offer = await db.collection("offers").findOne({ _id: new ObjectId(offerId) });
        if (!offer || offer.status !== "open" || offer.kind !== "coins")
          return send(res, 404, { error: "That coin lot is no longer open." });
        if (offer.userId === myId) return send(res, 400, { error: "That's your own lot." });
        const scheme = await db.collection("schemes").findOne({ _id: new ObjectId(offer.schemeId), status: "active" });
        if (!scheme) return send(res, 404, { error: "That coin scheme is no longer active." });
        // Tapper's role depends on the lot side: sell-lot tapper buys coins, buy-lot tapper sells coins.
        const tapperIsBuyer = offer.side === "sell";
        const sellerId = tapperIsBuyer ? offer.userId : myId;
        const buyerId = tapperIsBuyer ? myId : offer.userId;
        const tapperMember = await db.collection("memberships").findOne({ schemeId: offer.schemeId, userId: myId });
        if (!tapperMember) return send(res, 403, { error: "Join that coin scheme first — then trade its coins." });
        const sellerMember = await db.collection("memberships").findOne({ schemeId: offer.schemeId, userId: sellerId });
        if (!sellerMember || sellerMember.balance < offer.coinAmount)
          return send(res, 403, { error: `The seller now holds too few ${offer.schemeName} coins for this lot.` });
        if (await db.collection("proposals").findOne({ kind: "coins", offerId: String(offer._id), buyerId, status: "pending" }))
          return send(res, 409, { error: "A request on this lot is already pending." });
        const r = await db.collection("proposals").insertOne({
          kind: "coins", schemeId: offer.schemeId, schemeName: offer.schemeName,
          offerId: String(offer._id), qty: offer.coinAmount, amount: offer.coinAmount,
          buyerId, buyerUsername: tapperIsBuyer ? myName : offer.username,
          sellerId, sellerUsername: tapperIsBuyer ? offer.username : myName,
          ownerId: offer.userId,
          ownerUsername: offer.username,
          status: "pending", createdAt: now, decidedAt: null,
        });
        await db.collection("notifs").insertOne({
          userId: offer.userId, txnId: null, proposalId: String(r.insertedId),
          text: tapperIsBuyer
            ? `User ${myName} wants to buy ${offer.coinAmount} ${offer.schemeName} coins from your lot. Settle $${offer.coinAmount} outside the app, then approve.`
            : `User ${myName} offers ${offer.coinAmount} ${offer.schemeName} coins for your wanted lot. Pay them outside the app, then approve.`,
          read: false, createdAt: now,
        });
        return send(res, 200, { ok: true });
      }
      return send(res, 400, { error: "Unknown proposal type." });
    }

    if (action === "decide" && req.method === "POST") {
      const { proposalId, approve } = await readJson(req);
      const proposal = await db.collection("proposals").findOne({ _id: new ObjectId(proposalId) });
      if (!proposal) return send(res, 404, { error: "Request not found." });
      if (proposal.status !== "pending") return send(res, 409, { error: "This request was already decided." });
      if (proposal.ownerId !== String(me._id))
        return send(res, 403, { error: "Only the owner approves — settle payment outside the app first." });
      const now = new Date().toISOString();
      if (!approve) {
        await db.collection("proposals").updateOne({ _id: proposal._id }, { $set: { status: "rejected", decidedAt: now } });
        await db.collection("notifs").insertOne({
          userId: proposal.buyerId, txnId: null,
          text: `@${proposal.ownerUsername} declined your request (${proposal.kind === "scheme" ? `${proposal.tierName} scheme` : `${proposal.qty} ${proposal.schemeName} coins`}). No record was written.`,
          read: false, createdAt: now,
        });
        return send(res, 200, { ok: true });
      }
      if (proposal.kind === "scheme") {
        const scheme = await db.collection("schemes").findOne({ _id: new ObjectId(proposal.schemeId), status: "active" });
        if (!scheme) return send(res, 404, { error: "That scheme is no longer active." });
        if (!(await db.collection("memberships").findOne({ schemeId: proposal.schemeId, userId: proposal.buyerId }))) {
          await db.collection("memberships").insertOne({
            schemeId: proposal.schemeId, userId: proposal.buyerId, balance: 0,
            lastSettledAt: now, joinedAt: now,
          });
        }
        await db.collection("proposals").updateOne({ _id: proposal._id }, { $set: { status: "approved", decidedAt: now } });
        const r = await db.collection("txns").insertOne({
          senderId: proposal.buyerId, senderUsername: proposal.buyerUsername,
          targetId: proposal.ownerId, targetUsername: proposal.ownerUsername,
          targetWalletSnapshot: null,
          planId: proposal.tierId, planName: `${proposal.tierName} scheme`, amount: proposal.amount,
          kind: "scheme-buy", status: "completed",
          schemeId: proposal.schemeId, schemeName: proposal.schemeName, coinAmount: 0, offerId: null,
          copyLoggedAt: now, createdAt: now, completedAt: now, verifiedAmount: proposal.amount,
          completedBy: "owner",
        });
        const tid = String(r.insertedId);
        await db.collection("notifs").insertMany([
          { userId: proposal.buyerId, txnId: tid, text: `@${proposal.ownerUsername} approved you — you're now in the “${proposal.schemeName}” scheme and earn ${scheme.dailyCoins} coins daily.`, read: false, createdAt: now },
          { userId: proposal.ownerId, txnId: tid, text: `You approved @${proposal.buyerUsername} into “${proposal.schemeName}”. Recorded as a completed scheme entry.`, read: false, createdAt: now },
        ]);
        return send(res, 200, { ok: true });
      }
      // coin trade: move the coins, close the lot, complete the record.
      const seller = await db.collection("memberships").findOne({ schemeId: proposal.schemeId, userId: proposal.sellerId });
      const buyer = await db.collection("memberships").findOne({ schemeId: proposal.schemeId, userId: proposal.buyerId });
      if (!seller || seller.balance < proposal.qty)
        return send(res, 409, { error: `The seller now holds too few ${proposal.schemeName} coins — ask them to earn more first.` });
      if (!buyer) return send(res, 409, { error: "The buyer is no longer in that coin scheme." });
      await db.collection("memberships").updateOne({ _id: seller._id }, { $inc: { balance: -proposal.qty } });
      await db.collection("memberships").updateOne({ _id: buyer._id }, { $inc: { balance: proposal.qty } });
      await db.collection("coinlogs").insertMany([
        { userId: proposal.sellerId, schemeId: proposal.schemeId, schemeName: proposal.schemeName, kind: "spend", amount: -proposal.qty, balanceAfter: seller.balance - proposal.qty, ref: String(proposal._id), at: now },
        { userId: proposal.buyerId, schemeId: proposal.schemeId, schemeName: proposal.schemeName, kind: "earn", amount: proposal.qty, balanceAfter: buyer.balance + proposal.qty, ref: String(proposal._id), at: now },
      ]);
      await db.collection("proposals").updateOne({ _id: proposal._id }, { $set: { status: "approved", decidedAt: now } });
      if (proposal.offerId) {
        await db.collection("offers").updateOne({ _id: new ObjectId(proposal.offerId) }, { $set: { status: "closed", closedAt: now } });
      }
      const t2 = await db.collection("txns").insertOne({
        senderId: proposal.sellerId, senderUsername: proposal.sellerUsername,
        targetId: proposal.buyerId, targetUsername: proposal.buyerUsername,
        targetWalletSnapshot: null,
        planId: null, planName: "Coin trade", amount: proposal.qty,
        kind: "coin-trade", status: "completed",
        schemeId: proposal.schemeId, schemeName: proposal.schemeName, coinAmount: proposal.qty, offerId: proposal.offerId || null,
        copyLoggedAt: now, createdAt: now, completedAt: now, verifiedAmount: proposal.qty,
        completedBy: "owner",
      });
      const tid2 = String(t2.insertedId);
      await db.collection("notifs").insertMany([
        { userId: proposal.sellerId, txnId: tid2, text: `Coin trade completed: ${proposal.qty} ${proposal.schemeName} coins moved to @${proposal.buyerUsername}.`, read: false, createdAt: now },
        { userId: proposal.buyerId, txnId: tid2, text: `Coin trade completed: you received ${proposal.qty} ${proposal.schemeName} coins from @${proposal.sellerUsername}.`, read: false, createdAt: now },
      ]);
      return send(res, 200, { ok: true });
    }

    if (action === "redeem-request" && req.method === "POST") {
      // Direct buyout request: ask a specific user to buy your coins.
      const { schemeId, qty, targetUsername } = await readJson(req);
      const scheme = await db.collection("schemes").findOne({ _id: new ObjectId(schemeId), status: "active" });
      if (!scheme) return send(res, 404, { error: "Pick an active coin scheme." });
      const amount = Math.floor(Number(qty));
      if (!amount || amount < 1 || amount > 1000000) return send(res, 400, { error: "Enter how many coins (1 or more)." });
      const target = await db.collection("users").findOne({ usernameLower: String(targetUsername || "").trim().toLowerCase() });
      if (!target) return send(res, 404, { error: "No member with that username — check the spelling." });
      if (String(target._id) === String(me._id)) return send(res, 400, { error: "You can't request yourself." });
      const sid = String(scheme._id);
      const seller = await db.collection("memberships").findOne({ schemeId: sid, userId: String(me._id) });
      if (!seller) return send(res, 403, { error: "Join that coin scheme first — then redeem its coins." });
      if (seller.balance < amount)
        return send(res, 403, { error: `You hold ${seller.balance} ${scheme.name} coins — lower the quantity.` });
      const buyerMember = await db.collection("memberships").findOne({ schemeId: sid, userId: String(target._id) });
      if (!buyerMember) return send(res, 403, { error: `@${target.usernameDisplay || target.username} isn't in that scheme — they can't receive its coins.` });
      const now = new Date().toISOString();
      const r = await db.collection("proposals").insertOne({
        kind: "coins", schemeId: sid, schemeName: scheme.name,
        offerId: null, qty: amount, amount,
        buyerId: String(target._id), buyerUsername: target.usernameDisplay || target.username,
        sellerId: String(me._id), sellerUsername: me.usernameDisplay || me.username,
        ownerId: String(target._id), ownerUsername: target.usernameDisplay || target.username,
        status: "pending", createdAt: now, decidedAt: null,
      });
      await db.collection("notifs").insertOne({
        userId: String(target._id), txnId: null, proposalId: String(r.insertedId),
        text: `User ${me.usernameDisplay || me.username} asks you to buy ${amount} ${scheme.name} coins ($${amount}). Settle outside the app, then approve — the coins move on approval.`,
        read: false, createdAt: now,
      });
      return send(res, 200, { ok: true, message: `Buyout request sent to @${target.usernameDisplay || target.username}.` });
    }

    return send(res, 404, { error: "Unknown pairing action." });
  } catch (e) {
    return send(res, 500, { error: "Pairing failed" });
  }
}
