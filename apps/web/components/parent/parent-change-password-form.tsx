"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { changeMyPassword } from "@/lib/api/auth";
import { useAuth } from "@/lib/auth/auth-context";

const MIN_PASSWORD_LENGTH = 6;

export function ParentChangePasswordForm() {
  const router = useRouter();
  const { logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (!currentPassword || !newPassword || !confirmPassword) {
      setError("All password fields are required.");
      return;
    }

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(
        `New password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
      );
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("New password and confirm password must match.");
      return;
    }

    if (currentPassword === newPassword) {
      setError("New password must be different from current password.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await changeMyPassword({
        currentPassword,
        newPassword,
        confirmPassword,
      });

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSuccessMessage(response.message);
    } catch (changeError) {
      setError(
        changeError instanceof Error
          ? changeError.message
          : "Unable to change password.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleSignOutNow() {
    logout();
    router.replace("/login");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Password</CardTitle>
        <CardDescription>
          Change your password using your current credentials.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? <Notice tone="danger">{error}</Notice> : null}
        {successMessage ? (
          <Notice tone="success">
            <div className="space-y-3">
              <p>{successMessage}</p>
              <p className="text-sm text-emerald-800">
                Session invalidation is not server-tracked yet. Sign out and
                sign back in for best account hygiene.
              </p>
              <div>
                <Button
                  onClick={handleSignOutNow}
                  type="button"
                  variant="secondary"
                >
                  Sign out now
                </Button>
              </div>
            </div>
          </Notice>
        ) : null}

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="grid gap-4 md:grid-cols-3">
            <Field htmlFor="parent-password-current" label="Current password">
              <Input
                autoComplete="current-password"
                id="parent-password-current"
                onChange={(event) => setCurrentPassword(event.target.value)}
                required
                type="password"
                value={currentPassword}
              />
            </Field>

            <Field htmlFor="parent-password-new" label="New password">
              <Input
                autoComplete="new-password"
                id="parent-password-new"
                minLength={MIN_PASSWORD_LENGTH}
                onChange={(event) => setNewPassword(event.target.value)}
                required
                type="password"
                value={newPassword}
              />
            </Field>

            <Field
              htmlFor="parent-password-confirm"
              label="Confirm new password"
            >
              <Input
                autoComplete="new-password"
                id="parent-password-confirm"
                minLength={MIN_PASSWORD_LENGTH}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
                type="password"
                value={confirmPassword}
              />
            </Field>
          </div>

          <div className="flex justify-end">
            <Button disabled={isSubmitting} type="submit">
              {isSubmitting ? "Updating..." : "Change password"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
