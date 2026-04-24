"use client";

import { useParams } from "next/navigation";
import { UniformItemForm } from "@/components/admin/uniform-item-form";

export default function AdminUniformItemEditPage() {
  const params = useParams<{ id: string }>();

  return <UniformItemForm itemId={params.id} />;
}
