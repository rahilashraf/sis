import { CurrentClassesTable } from "@/components/classes/current-classes-table";
import Link from "next/link";
import { buttonClassName } from "@/components/ui/button";

export default function AdminClassesPage() {
  return (
    <CurrentClassesTable
      mode="admin"
      actions={
        <Link
          className={buttonClassName({ variant: "secondary" })}
          href="/admin/classes/manage"
        >
          Manage classes
        </Link>
      }
    />
  );
}
