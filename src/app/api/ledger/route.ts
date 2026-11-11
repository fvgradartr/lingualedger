import { readChainOrders, readChainTotals, readPolicy } from "@/lib/chain";
import { json } from "@/lib/http";
import { formatYocto } from "@/lib/pricing";
import { isPaused, listOrders } from "@/lib/store";

export async function GET() {
  const policy = await readPolicy();
  if (isPaused()) policy.paused = true;
  const orders = listOrders();
  const revenue = orders
    .filter((order) => order.status === "settled" || order.status === "delivered" || order.status === "paid")
    .reduce((sum, order) => sum + BigInt(order.amountYocto), BigInt("0"));
  const costs = orders.reduce((sum, order) => sum + BigInt(order.receipt.inferenceCostYocto || "0"), BigInt("0"));
  const distributed = orders
    .filter((order) => order.status === "settled")
    .reduce((sum, order) => sum + order.payouts.reduce((inner, line) => inner + BigInt(line.amountYocto), BigInt("0")), BigInt("0"));
  const [chainOrders, chainTotals] = await Promise.all([readChainOrders(), readChainTotals()]);
  return json({
    policy,
    desk: {
      orders,
      revenueYocto: formatYocto(revenue),
      costsYocto: formatYocto(costs),
      distributedYocto: formatYocto(distributed),
    },
    chain: {
      orders: chainOrders,
      totals: chainTotals,
    },
  });
}
