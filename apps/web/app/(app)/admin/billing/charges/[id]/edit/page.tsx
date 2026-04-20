"use client";

import { useParams } from "next/navigation";
import { BillingChargeEditForm } from "@/components/admin/billing-charge-edit-form";

export default function AdminBillingChargeEditPage() {
  const params = useParams<{ id: string }>();

  return <BillingChargeEditForm chargeId={params.id} />;
}
