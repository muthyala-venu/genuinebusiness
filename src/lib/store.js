// Shared constants + status helpers.
// Data operations live in src/lib/api.js (MongoDB via /api with offline fallback).

export const PLANS = [
  { id: "starter",  name: "Starter Tier",   amount: 50,  color: "#38bdf8", desc: "Entry manual tracking tier" },
  { id: "bronze",   name: "Bronze Tier",    amount: 150, color: "#f59e0b", desc: "Small-circle ledger tier" },
  { id: "silver",   name: "Silver Tier",    amount: 350, color: "#a78bfa", desc: "Mid-volume tracking tier" },
  { id: "gold",     name: "Gold Tier",      amount: 750, color: "#facc15", desc: "High-volume tracking tier" },
  { id: "platinum", name: "Platinum Tier",  amount: 1500, color: "#34d399", desc: "Top manual ledger tier" },
];

export const planById = (id) => PLANS.find((p) => p.id === id);
export const planAmounts = () => PLANS.map((p) => p.amount);

export function statusMeta(status) {
  switch (status) {
    case "completed":
      return { label: "Completed", classes: "bg-emerald-500/15 text-emerald-300 border-emerald-400/30" };
    case "awaiting_confirmation":
      return { label: "Awaiting Receiver Confirmation", classes: "bg-yellow-500/15 text-yellow-300 border-yellow-400/30" };
    case "address_copied":
      return { label: "Address Copied", classes: "bg-sky-500/15 text-sky-300 border-sky-400/30" };
    default:
      return { label: "Pending", classes: "bg-yellow-500/15 text-yellow-300 border-yellow-400/30" };
  }
}
