import { apiFetch } from "./client";

export type DataImportEntityType =
  | "students"
  | "parents"
  | "users"
  | "classes"
  | "library-items";

export type DataImportDuplicateStrategy = "fail" | "skip";

export type DataImportInput = {
  schoolId: string;
  entityType: DataImportEntityType;
  duplicateStrategy: DataImportDuplicateStrategy;
  csvContent: string;
};

export type DataImportPreviewRow = {
  rowNumber: number;
  status: "create" | "skip" | "error";
  identifier: string;
  message: string;
};

export type DataImportPreview = {
  entityType: DataImportEntityType;
  duplicateStrategy: DataImportDuplicateStrategy;
  schoolId: string;
  summary: {
    totalRows: number;
    createCount: number;
    skipCount: number;
    errorCount: number;
    duplicateCount: number;
  };
  warnings: string[];
  rows: DataImportPreviewRow[];
};

export type DataImportExecuteResult = {
  success: boolean;
  entityType: DataImportEntityType;
  schoolId: string;
  summary: {
    totalRows: number;
    createCount: number;
    skipCount: number;
    errorCount: number;
    duplicateCount: number;
    importedCount: number;
    skippedCount: number;
  };
  warnings: string[];
  rollback: string;
};

export function previewDataImport(input: DataImportInput) {
  return apiFetch<DataImportPreview>("/data-import/preview", {
    method: "POST",
    json: input,
  });
}

export function executeDataImport(input: DataImportInput) {
  return apiFetch<DataImportExecuteResult>("/data-import/execute", {
    method: "POST",
    json: input,
  });
}
