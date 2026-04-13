"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClassName } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { CheckboxField, Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useAuth } from "@/lib/auth/auth-context";
import type { UserRole } from "@/lib/auth/types";
import { formatRoleLabel } from "@/lib/utils";
import { listSchools, type School } from "@/lib/api/schools";
import { listGradeLevels, type GradeLevel } from "@/lib/api/grade-levels";
import {
  createUser,
  deleteUser,
  listUsers,
  updateUser as saveUser,
  type ManagedUser,
  type UpdateUserInput,
} from "@/lib/api/users";

const adminManageRoles: UserRole[] = ["OWNER", "SUPER_ADMIN", "ADMIN"];
const allRoleOptions: UserRole[] = [
  "OWNER",
  "SUPER_ADMIN",
  "ADMIN",
  "STAFF",
  "TEACHER",
  "SUPPLY_TEACHER",
  "PARENT",
  "STUDENT",
];

type CreateUserFormState = {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  password: string;
  role: UserRole;
  schoolId: string;
};

type EditUserFormState = {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  password: string;
};

const emptyCreateForm: CreateUserFormState = {
  firstName: "",
  lastName: "",
  username: "",
  email: "",
  password: "",
  role: "TEACHER",
  schoolId: "",
};

function getRoleOptions(role: UserRole) {
  if (role === "OWNER" || role === "SUPER_ADMIN") {
    return allRoleOptions;
  }

  return allRoleOptions.filter(
    (option) => option !== "OWNER" && option !== "SUPER_ADMIN",
  );
}

function buildEditForm(user: ManagedUser): EditUserFormState {
  return {
    firstName: user.firstName,
    lastName: user.lastName,
    username: user.username,
    email: user.email ?? "",
    role: user.role,
    isActive: user.isActive,
    password: "",
  };
}

function getPrimarySchoolId(user: ManagedUser) {
  return user.memberships[0]?.schoolId ?? "";
}

function buildUpdatePayload(
  originalUser: ManagedUser,
  form: EditUserFormState,
): UpdateUserInput {
  const payload: UpdateUserInput = {};
  const nextFirstName = form.firstName.trim();
  const nextLastName = form.lastName.trim();
  const nextUsername = form.username.trim();
  const nextEmail = form.email.trim();

  if (nextFirstName !== originalUser.firstName) {
    payload.firstName = nextFirstName;
  }

  if (nextLastName !== originalUser.lastName) {
    payload.lastName = nextLastName;
  }

  if (nextUsername !== originalUser.username) {
    payload.username = nextUsername;
  }

  if (nextEmail !== (originalUser.email ?? "")) {
    payload.email = nextEmail || undefined;
  }

  if (form.role !== originalUser.role) {
    payload.role = form.role;
  }

  if (form.isActive !== originalUser.isActive) {
    payload.isActive = form.isActive;
  }

  if (form.password.trim()) {
    payload.password = form.password;
  }

  return payload;
}

function getRoleBadgeVariant(role: UserRole) {
  if (role === "OWNER" || role === "SUPER_ADMIN" || role === "ADMIN") {
    return "primary" as const;
  }

  if (role === "TEACHER" || role === "SUPPLY_TEACHER") {
    return "warning" as const;
  }

  return "neutral" as const;
}

export function UsersManagement() {
  const { session, updateUser: updateSessionUser } = useAuth();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [gradeLevels, setGradeLevels] = useState<GradeLevel[]>([]);
  const [createForm, setCreateForm] = useState<CreateUserFormState>(emptyCreateForm);
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [editForm, setEditForm] = useState<EditUserFormState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ManagedUser | null>(null);
  const [showRemoved, setShowRemoved] = useState(false);
  const [roleFilter, setRoleFilter] = useState<UserRole | "ALL">("ALL");
  const [gradeLevelFilter, setGradeLevelFilter] = useState<string>("");
  const [sortOption, setSortOption] = useState<"name" | "createdAt">("name");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const currentRole = session?.user.role;
  const canManageUsers = currentRole ? adminManageRoles.includes(currentRole) : false;
  const roleOptions = currentRole ? getRoleOptions(currentRole) : [];

  const activeUsersCount = useMemo(
    () => users.filter((user) => user.isActive).length,
    [users],
  );

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      setError(null);

      try {
        const [userResponse, schoolResponse] = await Promise.all([
          listUsers({
            includeInactive: showRemoved,
            role: roleFilter === "ALL" ? undefined : roleFilter,
            gradeLevelId:
              roleFilter === "STUDENT" && gradeLevelFilter
                ? gradeLevelFilter
                : undefined,
            sort: sortOption,
          }),
          listSchools(),
        ]);

        setUsers(userResponse);
        setSchools(schoolResponse);
        setCreateForm((current) => ({
          ...current,
          schoolId: current.schoolId || schoolResponse[0]?.id || "",
        }));
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load users.");
      } finally {
        setIsLoading(false);
      }
    }

    void load();
  }, [gradeLevelFilter, roleFilter, showRemoved, sortOption]);

  useEffect(() => {
    if (roleFilter !== "STUDENT") {
      setGradeLevelFilter("");
    }
  }, [roleFilter]);

  useEffect(() => {
    async function loadGradeLevels() {
      if (roleFilter !== "STUDENT" || schools.length === 0) {
        setGradeLevels([]);
        return;
      }

      const settled = await Promise.allSettled(
        schools.filter((school) => school.isActive).map((school) => listGradeLevels(school.id)),
      );

      const results: GradeLevel[] = [];
      for (const result of settled) {
        if (result.status === "fulfilled") {
          results.push(...result.value.filter((entry) => entry.isActive));
        }
      }

      results.sort((a, b) => {
        if (a.school.name.localeCompare(b.school.name) !== 0) {
          return a.school.name.localeCompare(b.school.name);
        }
        if (a.sortOrder !== b.sortOrder) {
          return a.sortOrder - b.sortOrder;
        }
        return a.name.localeCompare(b.name);
      });

      setGradeLevels(results);
    }

    void loadGradeLevels();
  }, [roleFilter, schools]);

  async function refreshUsers() {
    const userResponse = await listUsers({
      includeInactive: showRemoved,
      role: roleFilter === "ALL" ? undefined : roleFilter,
      gradeLevelId:
        roleFilter === "STUDENT" && gradeLevelFilter ? gradeLevelFilter : undefined,
      sort: sortOption,
    });
    setUsers(userResponse);
  }

  function handleStartEdit(user: ManagedUser) {
    setEditingUser(user);
    setEditForm(buildEditForm(user));
    setSuccessMessage(null);
    setError(null);
  }

  async function handleCreateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canManageUsers) {
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      if (
        currentRole !== "OWNER" &&
        currentRole !== "SUPER_ADMIN" &&
        !createForm.schoolId
      ) {
        throw new Error("Select a school before creating this user.");
      }

      if (createForm.password.length < 6) {
        throw new Error("Password must be at least 6 characters.");
      }

      await createUser({
        firstName: createForm.firstName.trim(),
        lastName: createForm.lastName.trim(),
        username: createForm.username.trim(),
        email: createForm.email.trim() || undefined,
        password: createForm.password,
        role: createForm.role,
        schoolId: createForm.schoolId || undefined,
      });

      await refreshUsers();
      setCreateForm({
        ...emptyCreateForm,
        role: createForm.role,
        schoolId: createForm.schoolId,
      });
      setSuccessMessage("User created successfully.");
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Unable to create user.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleUpdateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editingUser || !editForm || !canManageUsers) {
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      if (editForm.password.trim() && editForm.password.length < 6) {
        throw new Error("Password must be at least 6 characters.");
      }

      const payload = buildUpdatePayload(editingUser, editForm);

      if (Object.keys(payload).length === 0) {
        setSuccessMessage("No changes to save.");
        setIsSubmitting(false);
        return;
      }

      const updatedUser = await saveUser(editingUser.id, payload);

      await refreshUsers();
      setEditingUser(updatedUser);
      setEditForm(buildEditForm(updatedUser));
      setSuccessMessage("User updated successfully.");

      if (session?.user.id === updatedUser.id) {
        updateSessionUser(updatedUser);
      }
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Unable to update user.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleToggleActive(user: ManagedUser) {
    if (!canManageUsers) {
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const updatedUser = await saveUser(user.id, {
        isActive: !user.isActive,
      });

      await refreshUsers();
      setSuccessMessage(
        updatedUser.isActive ? "User activated successfully." : "User deactivated successfully.",
      );

      if (editingUser?.id === updatedUser.id) {
        setEditingUser(updatedUser);
        setEditForm(buildEditForm(updatedUser));
      }

      if (session?.user.id === updatedUser.id) {
        updateSessionUser(updatedUser);
      }
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Unable to update user status.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDeleteUser() {
    if (!deleteTarget || !canManageUsers) {
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);
    setError(null);
    setSuccessMessage(null);

    try {
      const result = await deleteUser(deleteTarget.id);
      await refreshUsers();

      if (editingUser?.id === deleteTarget.id) {
        setEditingUser(null);
        setEditForm(null);
      }

      setSuccessMessage(
        result.removalMode === "deleted"
          ? "User deleted permanently."
          : "User removed from active admin workflows.",
      );
      setDeleteTarget(null);
    } catch (deletionError) {
      setDeleteError(
        deletionError instanceof Error
          ? deletionError.message
          : "Unable to delete user.",
      );
    } finally {
      setIsDeleting(false);
    }
  }

  function getSchoolLabel(user: ManagedUser) {
    const schoolId = getPrimarySchoolId(user);

    if (!schoolId) {
      return "No school assigned";
    }

    return (
      schools.find((school) => school.id === schoolId)?.name ?? "School assignment unavailable"
    );
  }

  if (!canManageUsers) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Users"
          description="User management is reserved for owner, super admin, and admin roles."
        />
        <EmptyState
          description="Your current role can sign in and use assigned workflows, but it cannot create or edit user accounts."
          title="User management is not available"
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        description="Create accounts, adjust roles, and control active access without interrupting current workflows."
        meta={
          <>
            <Badge variant="neutral">
              {showRemoved ? `${users.length} visible users` : `${users.length} active users`}
            </Badge>
            <Badge variant="neutral">{activeUsersCount} active</Badge>
          </>
        }
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}
      {successMessage ? <Notice tone="success">{successMessage}</Notice> : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Create User</CardTitle>
            <CardDescription>
              Add staff, teachers, families, or students with the correct role and school assignment.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4 md:grid-cols-2" onSubmit={handleCreateUser}>
              <Field htmlFor="create-user-first-name" label="First name">
                <Input
                  id="create-user-first-name"
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      firstName: event.target.value,
                    }))
                  }
                  required
                  value={createForm.firstName}
                />
              </Field>

              <Field htmlFor="create-user-last-name" label="Last name">
                <Input
                  id="create-user-last-name"
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      lastName: event.target.value,
                    }))
                  }
                  required
                  value={createForm.lastName}
                />
              </Field>

              <Field htmlFor="create-user-username" label="Username">
                <Input
                  id="create-user-username"
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      username: event.target.value,
                    }))
                  }
                  required
                  value={createForm.username}
                />
              </Field>

              <Field htmlFor="create-user-email" label="Email">
                <Input
                  id="create-user-email"
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      email: event.target.value,
                    }))
                  }
                  type="email"
                  value={createForm.email}
                />
              </Field>

              <Field
                description="Use a minimum of 6 characters."
                htmlFor="create-user-password"
                label="Password"
              >
                <Input
                  id="create-user-password"
                  minLength={6}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      password: event.target.value,
                    }))
                  }
                  required
                  type="password"
                  value={createForm.password}
                />
              </Field>

              <Field htmlFor="create-user-role" label="Role">
                <Select
                  id="create-user-role"
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      role: event.target.value as UserRole,
                    }))
                  }
                  value={createForm.role}
                >
                  {roleOptions.map((role) => (
                    <option key={role} value={role}>
                      {formatRoleLabel(role)}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field
                className="md:col-span-2"
                description="Admins should attach each user to the correct school before access is granted."
                htmlFor="create-user-school"
                label="School"
              >
                <Select
                  id="create-user-school"
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      schoolId: event.target.value,
                    }))
                  }
                  value={createForm.schoolId}
                >
                  <option value="">Select school</option>
                  {schools.map((school) => (
                    <option key={school.id} value={school.id}>
                      {school.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <div className="md:col-span-2 flex justify-end">
                <Button disabled={isSubmitting} type="submit">
                  {isSubmitting ? "Saving..." : "Create user"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {editingUser && editForm ? (
          <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle>Edit User</CardTitle>
                <CardDescription>
                  Updating {editingUser.firstName} {editingUser.lastName}.
                </CardDescription>
              </div>
              <Button
                onClick={() => {
                  setEditingUser(null);
                  setEditForm(null);
                }}
                type="button"
                variant="secondary"
              >
                Close
              </Button>
            </CardHeader>
            <CardContent>
              <form className="grid gap-4 md:grid-cols-2" onSubmit={handleUpdateUser}>
                <Field htmlFor="edit-user-first-name" label="First name">
                  <Input
                    id="edit-user-first-name"
                    onChange={(event) =>
                      setEditForm((current) =>
                        current
                          ? {
                              ...current,
                              firstName: event.target.value,
                            }
                          : current,
                      )
                    }
                    required
                    value={editForm.firstName}
                  />
                </Field>

                <Field htmlFor="edit-user-last-name" label="Last name">
                  <Input
                    id="edit-user-last-name"
                    onChange={(event) =>
                      setEditForm((current) =>
                        current
                          ? {
                              ...current,
                              lastName: event.target.value,
                            }
                          : current,
                      )
                    }
                    required
                    value={editForm.lastName}
                  />
                </Field>

                <Field htmlFor="edit-user-username" label="Username">
                  <Input
                    id="edit-user-username"
                    onChange={(event) =>
                      setEditForm((current) =>
                        current
                          ? {
                              ...current,
                              username: event.target.value,
                            }
                          : current,
                      )
                    }
                    required
                    value={editForm.username}
                  />
                </Field>

                <Field htmlFor="edit-user-email" label="Email">
                  <Input
                    id="edit-user-email"
                    onChange={(event) =>
                      setEditForm((current) =>
                        current
                          ? {
                              ...current,
                              email: event.target.value,
                            }
                          : current,
                      )
                    }
                    type="email"
                    value={editForm.email}
                  />
                </Field>

                <Field htmlFor="edit-user-role" label="Role">
                  <Select
                    id="edit-user-role"
                    onChange={(event) =>
                      setEditForm((current) =>
                        current
                          ? {
                              ...current,
                              role: event.target.value as UserRole,
                            }
                          : current,
                      )
                    }
                    value={editForm.role}
                  >
                    {roleOptions.map((role) => (
                      <option key={role} value={role}>
                        {formatRoleLabel(role)}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field
                  description="Leave blank to keep the current password."
                  htmlFor="edit-user-password"
                  label="Password reset"
                >
                  <Input
                    id="edit-user-password"
                    minLength={6}
                    onChange={(event) =>
                      setEditForm((current) =>
                        current
                          ? {
                              ...current,
                              password: event.target.value,
                            }
                          : current,
                      )
                    }
                    placeholder="Leave blank to keep current password"
                    type="password"
                    value={editForm.password}
                  />
                </Field>

                <label className="md:col-span-2 flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <input
                    checked={editForm.isActive}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-slate-950 focus:ring-4 focus:ring-slate-950/10"
                    id="edit-user-active"
                    onChange={(event) =>
                      setEditForm((current) =>
                        current
                          ? {
                              ...current,
                              isActive: event.target.checked,
                            }
                          : current,
                      )
                    }
                    type="checkbox"
                  />
                  <span>
                    <span className="block text-sm font-medium text-slate-800">
                      User is active
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-slate-500">
                      Inactive users keep their record but cannot continue signing in.
                    </span>
                  </span>
                </label>

                <div className="md:col-span-2 flex justify-end">
                  <Button disabled={isSubmitting} type="submit">
                    {isSubmitting ? "Saving..." : "Save changes"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Edit User</CardTitle>
              <CardDescription>
                Select a user from the table to update access, names, or role details.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <EmptyState
                compact
                description="Choose a user from the list below when you need to update account details or reset access."
                title="No user selected"
              />
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>User Directory</CardTitle>
            <CardDescription>
              Review current account status, school assignment, and role coverage at a glance.
            </CardDescription>
          </div>
          <div className="flex flex-col gap-3 sm:items-end">
            <Badge variant="neutral">
              {isLoading ? "Loading users..." : `${users.length} records`}
            </Badge>
            <div className="grid w-full max-w-sm gap-2">
              <div className="grid gap-2 sm:grid-cols-2">
                <Field htmlFor="user-filter-role" label="Role">
                  <Select
                    id="user-filter-role"
                    onChange={(event) => setRoleFilter(event.target.value as UserRole | "ALL")}
                    value={roleFilter}
                  >
                    <option value="ALL">All roles</option>
                    {allRoleOptions.map((role) => (
                      <option key={role} value={role}>
                        {formatRoleLabel(role)}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field htmlFor="user-filter-sort" label="Sort">
                  <Select
                    id="user-filter-sort"
                    onChange={(event) => setSortOption(event.target.value as "name" | "createdAt")}
                    value={sortOption}
                  >
                    <option value="name">Name (A–Z)</option>
                    <option value="createdAt">Newest</option>
                  </Select>
                </Field>
              </div>

              {roleFilter === "STUDENT" ? (
                <Field htmlFor="user-filter-grade" label="Grade level">
                  <Select
                    id="user-filter-grade"
                    onChange={(event) => setGradeLevelFilter(event.target.value)}
                    value={gradeLevelFilter}
                  >
                    <option value="">All grade levels</option>
                    {gradeLevels.map((level) => (
                      <option key={level.id} value={level.id}>
                        {(level.school.shortName ?? level.school.name).trim()} — {level.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : null}
            </div>
            <CheckboxField
              checked={showRemoved}
              className="rounded-xl border border-slate-200 px-3 py-2"
              description="Include inactive users that were removed from normal admin workflows."
              label="Show removed users"
              onChange={(event) => setShowRemoved(event.target.checked)}
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50/80">
                  <tr>
                    <th className="px-4 py-3 font-semibold text-slate-700">User</th>
                    <th className="px-4 py-3 font-semibold text-slate-700">Role</th>
                    <th className="px-4 py-3 font-semibold text-slate-700">School</th>
                    <th className="px-4 py-3 font-semibold text-slate-700">Status</th>
                    <th className="px-4 py-3 font-semibold text-slate-700">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {users.map((user) => (
                    <tr className="align-top hover:bg-slate-50" key={user.id}>
                      <td className="px-4 py-4">
                        <p className="font-medium text-slate-900">
                          {user.firstName} {user.lastName}
                        </p>
                        <p className="mt-1 text-sm text-slate-500">@{user.username}</p>
                        <p className="mt-1 text-sm text-slate-500">
                          {user.email ?? "No email on file"}
                        </p>
                      </td>
                      <td className="px-4 py-4">
                        <Badge variant={getRoleBadgeVariant(user.role)}>
                          {formatRoleLabel(user.role)}
                        </Badge>
                      </td>
                      <td className="px-4 py-4 text-slate-600">{getSchoolLabel(user)}</td>
                      <td className="px-4 py-4">
                        <Badge variant={user.isActive ? "success" : "neutral"}>
                          {user.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap gap-2">
                          <Button
                            onClick={() => handleStartEdit(user)}
                            type="button"
                            variant="secondary"
                          >
                            Edit
                          </Button>
                          {user.role === "STUDENT" ? (
                            <Link
                              className={buttonClassName({ variant: "ghost" })}
                              href={`/admin/students/${user.id}`}
                            >
                              Student detail
                            </Link>
                          ) : null}
                          <Button
                            disabled={isSubmitting || isDeleting}
                            onClick={() => handleToggleActive(user)}
                            type="button"
                            variant={user.isActive ? "danger" : "primary"}
                          >
                            {user.isActive ? "Deactivate" : "Activate"}
                          </Button>
                          <Button
                            disabled={isSubmitting || isDeleting}
                            onClick={() => {
                              setDeleteTarget(user);
                              setDeleteError(null);
                              setError(null);
                              setSuccessMessage(null);
                            }}
                            type="button"
                            variant="danger"
                          >
                            Remove
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!isLoading && users.length === 0 ? (
                    <tr>
                      <td className="px-4 py-8" colSpan={5}>
                        <EmptyState
                          compact
                          description="Create the first user to start assigning roles and school access."
                          title="No users found"
                        />
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>

      <ConfirmDialog
        description={
          deleteTarget
            ? `Remove ${deleteTarget.firstName} ${deleteTarget.lastName} from active admin workflows? Empty users are deleted permanently. Users with related enrollments, attendance, grades, or family links are safely deactivated instead.`
            : ""
        }
        errorMessage={deleteError}
        isOpen={deleteTarget !== null}
        isPending={isDeleting}
        onCancel={() => {
          if (!isDeleting) {
            setDeleteTarget(null);
            setDeleteError(null);
          }
        }}
        onConfirm={handleDeleteUser}
        title="Remove user"
      />
    </div>
  );
}
