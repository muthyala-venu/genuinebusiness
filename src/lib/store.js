// Shared constants + status helpers.
// Data operations live in src/lib/api.js (MongoDB via /api with offline fallback).

export const PLANS = [
  { id: "starter",  name: "Starter",   amount: 50,  color: "#38bdf8", tag: "First steps",    desc: "For new circles learning the ropes — small, simple records." },
  { id: "bronze",   name: "Bronze",    amount: 150, color: "#f59e0b", tag: "Most chosen",    desc: "The everyday tier for active pairs who log often." },
  { id: "silver",   name: "Silver",    amount: 350, color: "#a78bfa", tag: "Growing circles", desc: "For busier circles that need a tidy, trusted trail." },
  { id: "gold",     name: "Gold",      amount: 750, color: "#facc15", tag: "High volume",    desc: "For serious record-keepers with frequent pairings." },
  { id: "platinum", name: "Platinum",  amount: 1500, color: "#34d399", tag: "Inner circle",   desc: "Top tier for the most committed tracking circles." },
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
