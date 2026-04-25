import { CurrentClassesTable } from "@/components/classes/current-classes-table";
import Link from "next/link";
import { buttonClassName } from "@/components/ui/button";

export default function AdminClassesPage() {
  return (
    <CurrentClassesTable
      mode="admin"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Link
            className={buttonClassName({ variant: "secondary" })}
            href="/admin/classes/bulk-enrollment"
          >
            Bulk enrollment
          </Link>
          <Link
            className={buttonClassName({ variant: "secondary" })}
            href="/admin/classes/manage"
          >
            Manage classes
          </Link>
          <Link
            className={buttonClassName({ variant: "secondary" })}
            href="/admin/classes/manage#create-class"
          >
            Create Classes
          </Link>
        </div>
      }
    />
  );
}
