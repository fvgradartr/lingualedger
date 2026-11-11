import type { JobOrder } from "@/lib/types";

const KEY = "lingualedger.orders.v1";

export function readLocalOrders(): Record<string, JobOrder> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, JobOrder>) : {};
  } catch {
    return {};
  }
}

export function saveLocalOrder(order: JobOrder): void {
  const all = readLocalOrders();
  all[order.id] = order;
  window.localStorage.setItem(KEY, JSON.stringify(all));
}
