import { PaymentReceiptView } from "@/components/billing/payment-receipt";

type Props = {
  params: Promise<{
    id: string;
  }>;
};

export default async function ReceiptPage({ params }: Props) {
  const { id } = await params;
  return <PaymentReceiptView paymentId={id} />;
}
