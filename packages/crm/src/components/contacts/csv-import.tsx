"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { bulkImportContactsAction } from "@/lib/contacts/actions";
import { isDemoBlockedError, isDemoReadonlyClient } from "@/lib/demo/client";
import { useDemoToast } from "@/components/shared/demo-toast-provider";

type ImportField = "fullName" | "firstName" | "lastName" | "email" | "phone" | "company" | "status" | "notes" | "skip";

type ParsedDataset = {
  headers: string[];
  rows: Array<Record<string, string>>;
};

type ImportResult = {
  createdCount: number;
  stageSummary: Array<{ stage: string; count: number }>;
  fallbackCount: number;
};

const fieldOptions: Array<{ value: ImportField; label: string }> = [
  { value: "fullName", label: "Name" },
  { value: "firstName", label: "First Name" },
  { value: "lastName", label: "Last Name" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "company", label: "Company" },
  { value: "status", label: "Pipeline Stage" },
  { value: "notes", label: "Notes" },
  { value: "skip", label: "Skip this column" },
];

const headerSynonyms: Record<Exclude<ImportField, "skip" | "fullName"> | "fullName", string[]> = {
  fullName: ["name", "full name", "contact name"],
  firstName: ["first name", "firstname", "given name"],
  lastName: ["last name", "lastname", "surname", "family name"],
  email: ["email", "email address", "e-mail"],
  phone: ["phone", "phone number", "mobile", "cell"],
  company: ["company", "organization", "business"],
  status: ["status", "stage", "pipeline stage", "lead status"],
  notes: ["notes", "note", "comments", "description"],
};

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function detectMapping(headers: string[]) {
  const mapping: Record<string, ImportField> = {};

  for (const header of headers) {
    const normalized = normalize(header);
    let detected: ImportField = "skip";

    for (const [field, synonyms] of Object.entries(headerSynonyms) as Array<[ImportField, string[]]>) {
      if (synonyms.some((synonym) => normalized === normalize(synonym) || normalized.includes(normalize(synonym)))) {
        detected = field;
        break;
      }
    }

    mapping[header] = detected;
  }

  return mapping;
}

function splitName(fullName: string) {
  const trimmed = fullName.trim();
  if (!trimmed) {
    return { firstName: "", lastName: "" };
  }

  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: "" };
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

export function CsvImport({ stageOptions }: { stageOptions: string[] }) {
  const router = useRouter();
  const { showDemoToast } = useDemoToast();
  const [pending, startTransition] = useTransition();
  const [dataset, setDataset] = useState<ParsedDataset | null>(null);
  const [mapping, setMapping] = useState<Record<string, ImportField>>({});
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const previewRows = useMemo(() => dataset?.rows.slice(0, 3) ?? [], [dataset]);

  const mappedRows = useMemo(() => {
    if (!dataset) {
      return [];
    }

    return dataset.rows.map((row) => {
      const output: {
        firstName?: string;
        lastName?: string;
        email?: string;
        phone?: string;
        company?: string;
        status?: string;
        notes?: string;
      } = {};

      for (const header of dataset.headers) {
        const field = mapping[header] ?? "skip";
        const value = String(row[header] ?? "").trim();

        if (!value || field === "skip") {
          continue;
        }

        if (field === "fullName") {
          const split = splitName(value);
          if (!output.firstName) {
            output.firstName = split.firstName;
          }
          if (!output.lastName) {
            output.lastName = split.lastName;
          }
          continue;
        }

        output[field] = value;
      }

      if (!output.firstName && output.email) {
        output.firstName = output.email.split("@")[0];
      }

      if (!output.status && stageOptions.length > 0) {
        output.status = stageOptions[0];
      }

      return output;
    });
  }, [dataset, mapping, stageOptions]);

  function handleParsedData(headers: string[], rows: Array<Record<string, string>>) {
    const cleanedRows = rows.filter((row) => Object.values(row).some((value) => String(value ?? "").trim().length > 0));

    if (headers.length === 0 || cleanedRows.length === 0) {
      setError("No rows detected in file.");
      setDataset(null);
      setMapping({});
      return;
    }

    setDataset({ headers, rows: cleanedRows });
    setMapping(detectMapping(headers));
    setError(null);
    setResult(null);
  }

  function onCsvFile(file: File) {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results: Papa.ParseResult<Record<string, string>>) => {
        const fields = (results.meta.fields ?? []).map((field: string) => String(field));
        const rows = (results.data ?? []).map((row: Record<string, string>) => {
          const next: Record<string, string> = {};
          for (const field of fields) {
            next[field] = String(row[field] ?? "");
          }
          return next;
        });
        handleParsedData(fields, rows);
      },
      error: () => {
        setError("Unable to parse CSV file.");
      },
    });
  }

  async function onSpreadsheetFile(file: File) {
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const firstSheetName = workbook.SheetNames[0];
      const firstSheet = firstSheetName ? workbook.Sheets[firstSheetName] : null;

      if (!firstSheet) {
        setError("Spreadsheet has no sheets.");
        return;
      }

      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: "" });
      const headers = rows.length > 0 ? Object.keys(rows[0] ?? {}) : [];
      const normalizedRows = rows.map((row) => {
        const next: Record<string, string> = {};
        for (const header of headers) {
          next[header] = String(row[header] ?? "");
        }
        return next;
      });

      handleParsedData(headers, normalizedRows);
    } catch {
      setError("Unable to parse spreadsheet file.");
    }
  }

  function onFileSelected(file: File | null) {
    if (!file) {
      return;
    }

    const lower = file.name.toLowerCase();
    if (lower.endsWith(".csv")) {
      onCsvFile(file);
      return;
    }

    if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
      void onSpreadsheetFile(file);
      return;
    }

    setError("Unsupported file type. Use CSV or XLSX.");
  }

  function importRows() {
    if (!dataset || mappedRows.length === 0 || pending) {
      return;
    }

    startTransition(async () => {
      try {
        if (isDemoReadonlyClient) {
          showDemoToast();
          return;
        }

        const payload = mappedRows.filter((row) => row.firstName || row.email || row.phone);
        if (payload.length === 0) {
          setError("No valid contact rows to import.");
          return;
        }

        const importResult = await bulkImportContactsAction({ rows: payload });
        setResult(importResult);
        setError(null);
        router.refresh();
      } catch (cause) {
        if (isDemoBlockedError(cause)) {
          showDemoToast();
          return;
        }
        setError("Import failed. Please check your mapping and try again.");
      }
    });
  }

  return (
    <section className="bg-card text-card-foreground rounded-xl border p-4 sm:p-6 space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Import your clients</h2>
        <p className="text-sm text-muted-foreground">Upload CSV/XLSX, map columns, and import in batches.</p>
      </div>

      <label className="block rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
        <input
          type="file"
          accept=".csv,.xlsx,.xls"
          className="hidden"
          onChange={(event) => onFileSelected(event.target.files?.[0] ?? null)}
        />
        <span className="font-medium text-foreground">Choose CSV or Excel file</span>
        <span className="block mt-1">Supports HubSpot, Google Contacts, spreadsheets, and exports from other CRMs.</span>
      </label>

      {dataset ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="grid grid-cols-2 gap-2 px-3 py-2 text-xs font-medium text-muted-foreground border-b border-border bg-muted/30">
              <span>Your column</span>
              <span>SeldonFrame field</span>
            </div>
            <div className="max-h-64 overflow-y-auto divide-y divide-border">
              {dataset.headers.map((header) => (
                <div key={header} className="grid grid-cols-2 gap-2 px-3 py-2 text-sm">
                  <span className="truncate">{header}</span>
                  <select
                    className="crm-input h-8 w-full px-2 text-sm"
                    value={mapping[header] ?? "skip"}
                    onChange={(event) => setMapping((current) => ({ ...current, [header]: event.target.value as ImportField }))}
                  >
                    {fieldOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-border p-3 space-y-2">
            <p className="text-xs text-muted-foreground">Preview (3 of {dataset.rows.length} rows)</p>
            <div className="space-y-1 text-sm">
              {previewRows.map((row, index) => (
                <p key={index} className="text-muted-foreground truncate">{Object.values(row).join(" | ")}</p>
              ))}
            </div>
          </div>

          <button type="button" onClick={importRows} disabled={pending} className="crm-button-primary h-9 px-4 text-sm">
            {pending ? "Importing..." : `Import ${dataset.rows.length} contacts →`}
          </button>
        </div>
      ) : null}

      {result ? (
        <div className="rounded-lg border border-positive/30 bg-positive/10 p-4 space-y-2 text-sm text-positive">
          <p className="font-medium">✓ {result.createdCount} contacts imported</p>
          {result.stageSummary.map((item) => (
            <p key={item.stage}>• {item.count} matched to &quot;{item.stage}&quot;</p>
          ))}
          {result.fallbackCount > 0 ? (
            <p>• {result.fallbackCount} assigned to default stage</p>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </section>
  );
}
