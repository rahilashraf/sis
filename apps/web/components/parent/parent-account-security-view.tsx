"use client";

import Link from "next/link";
import { buttonClassName } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { ParentAccountSecurityCard } from "./parent-account-security-card";

export function ParentAccountSecurityView() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Account Security"
        description="Review identity and basic security visibility for your account."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              className={buttonClassName({ variant: "secondary" })}
              href="/parent/account"
            >
              Back to account
            </Link>
            <Link
              className={buttonClassName({ variant: "secondary" })}
              href="/parent"
            >
              Back to parent portal
            </Link>
          </div>
        }
      />

      <ParentAccountSecurityCard />
    </div>
  );
}
