"use client";

import Link from "next/link";
import { buttonClassName } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { ParentAccountProfileForm } from "./parent-account-profile-form";
import { ParentChangePasswordForm } from "./parent-change-password-form";

export function ParentAccountOverview() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="My Account"
        description="Manage your parent account profile and password."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              className={buttonClassName({ variant: "secondary" })}
              href="/parent/account/security"
            >
              Security
            </Link>
            <Link className={buttonClassName({ variant: "secondary" })} href="/parent">
              Back to parent portal
            </Link>
          </div>
        }
      />

      <ParentAccountProfileForm />
      <ParentChangePasswordForm />
    </div>
  );
}
