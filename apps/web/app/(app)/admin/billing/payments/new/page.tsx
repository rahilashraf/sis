"use client";

import { Suspense } from "react";
import { BillingPaymentCreateForm } from "@/components/admin/billing-payment-create-form";

function PaymentFormPage() {
  return <BillingPaymentCreateForm />;
}

export default function AdminBillingPaymentNewPage() {
  return (
    <Suspense>
      <PaymentFormPage />
    </Suspense>
  );
}
