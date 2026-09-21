import { notFound, redirect } from "next/navigation";
import { prisma } from "@/app/lib/prisma";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const order = await prisma.order.findUnique({
    where: { id, deletedAt: null },
    select: { orderNumber: true, customerName: true },
  });
  if (!order) return { title: "Không tìm thấy" };
  return { title: `${order.orderNumber} — ${order.customerName}` };
}

export default async function OrderDetailPage({ params }: Props) {
  const { id } = await params;

  const raw = await prisma.order.findUnique({
    where: { id, deletedAt: null },
    select: { zone: true },
  });

  if (!raw) notFound();

  const targetTab = raw.zone === "PRE_PRODUCTION" ? "pre-production" : "master-hub";
  redirect(`/dashboard/orders?tab=${targetTab}&orderId=${id}`);
}
