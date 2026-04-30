"use client";

import { useEffect, useState } from "react";
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
import { useAuth } from "@/lib/auth/auth-context";
import { updateMyProfile } from "@/lib/api/auth";

export function ParentAccountProfileForm() {
  const { session, updateUser } = useAuth();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setFirstName(session?.user.firstName ?? "");
    setLastName(session?.user.lastName ?? "");
    setEmail(session?.user.email ?? "");
    setPhone(session?.user.phone ?? "");
  }, [
    session?.user.firstName,
    session?.user.lastName,
    session?.user.email,
    session?.user.phone,
  ]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccessMessage(null);

    const nextFirstName = firstName.trim();
    const nextLastName = lastName.trim();
    const nextEmail = email.trim();
    const nextPhone = phone.trim();

    if (!nextFirstName || !nextLastName) {
      setError("First name and last name are required.");
      return;
    }

    setIsSubmitting(true);

    try {
      const updated = await updateMyProfile({
        firstName: nextFirstName,
        lastName: nextLastName,
        email: nextEmail || undefined,
        phone: nextPhone || undefined,
      });

      updateUser(updated);
      setSuccessMessage("Profile updated successfully.");
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Unable to update profile.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>
          Update your name, email, and phone details. Username is read-only.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? <Notice tone="danger">{error}</Notice> : null}
        {successMessage ? (
          <Notice tone="success">{successMessage}</Notice>
        ) : null}

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <Field htmlFor="parent-account-first-name" label="First name">
              <Input
                id="parent-account-first-name"
                onChange={(event) => setFirstName(event.target.value)}
                required
                value={firstName}
              />
            </Field>

            <Field htmlFor="parent-account-last-name" label="Last name">
              <Input
                id="parent-account-last-name"
                onChange={(event) => setLastName(event.target.value)}
                required
                value={lastName}
              />
            </Field>

            <Field htmlFor="parent-account-phone" label="Phone">
              <Input
                id="parent-account-phone"
                onChange={(event) => setPhone(event.target.value)}
                placeholder="Optional"
                value={phone}
              />
            </Field>

            <Field htmlFor="parent-account-email" label="Email">
              <Input
                id="parent-account-email"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Optional"
                type="email"
                value={email}
              />
            </Field>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field htmlFor="parent-account-username" label="Username">
              <Input
                disabled
                id="parent-account-username"
                value={session?.user.username ?? ""}
              />
            </Field>

          </div>

          <div className="flex justify-end">
            <Button disabled={isSubmitting} type="submit">
              {isSubmitting ? "Saving..." : "Save profile"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
