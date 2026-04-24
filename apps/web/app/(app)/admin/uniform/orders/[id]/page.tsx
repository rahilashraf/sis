"use client";

import { useParams } from "next/navigation";
import { UniformOrderDetail } from "@/components/admin/uniform-order-detail";

export default function AdminUniformOrderDetailPage() {
  const params = useParams<{ id: string }>();

  return <UniformOrderDetail orderId={params.id} />;
}
