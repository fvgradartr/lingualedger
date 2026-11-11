import { OrderView } from "@/components/order-view";
import { Shell } from "@/components/shell";

export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ fresh?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  return (
    <Shell>
      <OrderView id={id} fresh={query.fresh === "1"} />
    </Shell>
  );
}
