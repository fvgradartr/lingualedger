import { json } from "@/lib/http";
import { getOrder } from "@/lib/store";
import { readChainOrders } from "@/lib/chain";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const local = getOrder(id);
  if (local) return json({ order: local, source: "desk" });
  const chain = (await readChainOrders()).find((order) => order.id === id) ?? null;
  if (chain) return json({ order: chain, source: "chain" });
  return json({ error: "No job with that id in this desk or on the testnet contract." }, 404);
}
