import type { Metadata } from "next";
import { requireRole } from "@/app/lib/auth-helpers";
import CreateOrderForm from "./_components/create-order-form";

export const metadata: Metadata = { title: "Tạo đơn hàng mới" };

type Props = {
  searchParams: Promise<{ from?: string }>;
};

export default async function NewOrderPage({ searchParams }: Props) {
  await requireRole(["ORDER", "PRODUCTION", "ADMIN"]);
  const params = await searchParams;
  const fromTab = typeof params.from === "string" ? params.from : undefined;
  return (
    <div style={{ height: "100%", overflowY: "auto", background: "var(--cream)" }}>
      <CreateOrderForm fromTab={fromTab} />
    </div>
  );
}
