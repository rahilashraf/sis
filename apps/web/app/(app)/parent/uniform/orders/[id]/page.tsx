"use client";

import { useParams } from "next/navigation";
import { ParentUniformOrderDetail } from "@/components/parent/parent-uniform-order-detail";

export default function ParentUniformOrderDetailPage() {
  const params = useParams<{ id: string }>();

  return <ParentUniformOrderDetail orderId={params.id} />;
}
