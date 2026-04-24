"use client";

import { useParams } from "next/navigation";
import { LibraryItemForm } from "@/components/admin/library-item-form";

export default function AdminLibraryItemEditPage() {
  const params = useParams<{ id: string }>();

  return <LibraryItemForm itemId={params.id} />;
}
