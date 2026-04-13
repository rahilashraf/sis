import { apiFetch } from "./client";

export type FormFieldType =
  | "SHORT_TEXT"
  | "LONG_TEXT"
  | "SELECT"
  | "CHECKBOX"
  | "DATE";

export type FormField = {
  id: string;
  formId: string;
  key: string;
  label: string;
  type: FormFieldType;
  optionsJson: string[] | null;
  sortOrder: number;
  isRequired: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type FormSchoolSummary = {
  id: string;
  name: string;
  shortName: string | null;
  isActive: boolean;
};

export type FormSummary = {
  id: string;
  schoolId: string;
  createdByUserId: string;
  title: string;
  description: string | null;
  isActive: boolean;
  opensAt: string | null;
  closesAt: string | null;
  requiresStudentContext: boolean;
  createdAt: string;
  updatedAt: string;
  fields: FormField[];
  school?: FormSchoolSummary;
  _count?: {
    responses: number;
  };
};

export type CreateFormInput = {
  schoolId: string;
  title: string;
  description?: string | null;
  isActive?: boolean;
  opensAt?: string;
  closesAt?: string;
  requiresStudentContext?: boolean;
  fields: Array<{
    key: string;
    label: string;
    type: FormFieldType;
    options?: string[];
    sortOrder?: number;
    isRequired?: boolean;
    isActive?: boolean;
  }>;
};

export type UpdateFormInput = {
  title?: string;
  description?: string | null;
  isActive?: boolean;
  opensAt?: string;
  closesAt?: string;
  requiresStudentContext?: boolean;
  fields?: Array<{
    key: string;
    label: string;
    type: FormFieldType;
    options?: string[];
    sortOrder?: number;
    isRequired?: boolean;
    isActive?: boolean;
  }>;
};

export type FormResponseValue = {
  id: string;
  responseId: string;
  fieldId: string;
  valueText: string | null;
  createdAt: string;
  updatedAt: string;
  field: {
    id: string;
    key: string;
    label: string;
    type: FormFieldType;
    sortOrder: number;
  };
};

export type FormResponse = {
  id: string;
  formId: string;
  schoolId: string;
  parentId: string;
  studentId: string | null;
  submittedAt: string;
  createdAt: string;
  updatedAt: string;
  parent: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    username: string;
  };
  student: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    username: string;
  } | null;
  values: FormResponseValue[];
};

export type ParentFormState = "OPEN" | "SUBMITTED" | "CLOSED";

export type ParentFormSummary = FormSummary & {
  state: ParentFormState;
  hasSubmitted: boolean;
};

export type ParentFormDetail = FormSummary & {
  linkedStudents: Array<{
    id: string;
    firstName: string;
    lastName: string;
  }>;
};

export function listForms(options?: {
  schoolId?: string;
  includeInactive?: boolean;
}) {
  const query = new URLSearchParams();

  if (options?.schoolId) {
    query.set("schoolId", options.schoolId);
  }

  if (options?.includeInactive !== undefined) {
    query.set("includeInactive", options.includeInactive ? "true" : "false");
  }

  return apiFetch<FormSummary[]>(
    `/forms${query.size ? `?${query.toString()}` : ""}`,
  );
}

export function getFormById(formId: string) {
  return apiFetch<FormSummary>(`/forms/${formId}`);
}

export function createForm(input: CreateFormInput) {
  return apiFetch<FormSummary>("/forms", {
    method: "POST",
    json: input,
  });
}

export function updateForm(formId: string, input: UpdateFormInput) {
  return apiFetch<FormSummary>(`/forms/${formId}`, {
    method: "PATCH",
    json: input,
  });
}

export function archiveForm(formId: string) {
  return apiFetch<FormSummary>(`/forms/${formId}/archive`, {
    method: "PATCH",
  });
}

export function activateForm(formId: string) {
  return apiFetch<FormSummary>(`/forms/${formId}/activate`, {
    method: "PATCH",
  });
}

export function deleteForm(formId: string) {
  return apiFetch<{ success: boolean; removalMode: "deleted" }>(`/forms/${formId}`, {
    method: "DELETE",
  });
}

export function getFormResponses(formId: string) {
  return apiFetch<FormResponse[]>(`/forms/${formId}/responses`);
}

export function listParentForms(studentId?: string) {
  const query = new URLSearchParams();
  if (studentId) {
    query.set("studentId", studentId);
  }

  return apiFetch<ParentFormSummary[]>(
    `/forms/for-parent${query.size ? `?${query.toString()}` : ""}`,
  );
}

export function listActiveParentForms(studentId?: string) {
  const query = new URLSearchParams();
  if (studentId) {
    query.set("studentId", studentId);
  }

  return apiFetch<FormSummary[]>(
    `/forms/active${query.size ? `?${query.toString()}` : ""}`,
  );
}

export function getParentFormById(formId: string, studentId?: string) {
  const query = new URLSearchParams();
  if (studentId) {
    query.set("studentId", studentId);
  }

  return apiFetch<ParentFormDetail>(
    `/forms/${formId}/for-parent${query.size ? `?${query.toString()}` : ""}`,
  );
}

export function submitParentForm(
  formId: string,
  input: {
    studentId?: string | null;
    values: Array<{ fieldId: string; value?: string | null }>;
  },
) {
  return apiFetch<FormResponse>(`/forms/${formId}/submit`, {
    method: "POST",
    json: input,
  });
}
