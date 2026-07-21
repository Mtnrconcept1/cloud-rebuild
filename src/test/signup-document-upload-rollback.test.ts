import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  findUncommittedVerificationDocumentPaths,
  removeVerificationDocuments,
  removeVerificationDocumentsBestEffort,
  uploadVerificationDocumentsWithRollback,
} from "@/lib/signup";

const storageMocks = vi.hoisted(() => ({
  upload: vi.fn(),
  remove: vi.fn(),
}));

const manifestMocks = vi.hoisted(() => ({
  in: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  getSupabase: () => {
    const manifestQuery = {
      select: vi.fn(() => manifestQuery),
      eq: vi.fn(() => manifestQuery),
      in: manifestMocks.in,
    };
    return {
      from: () => manifestQuery,
      storage: {
        from: () => ({
          upload: storageMocks.upload,
          remove: storageMocks.remove,
        }),
      },
    };
  },
}));

function documentFile(name: string) {
  return new File(["%PDF-1.7"], name, { type: "application/pdf" });
}

describe("verification document upload rollback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageMocks.upload.mockResolvedValue({ data: null, error: null });
    storageMocks.remove.mockResolvedValue({ data: null, error: null });
    manifestMocks.in.mockResolvedValue({ data: [], error: null });
  });

  it("removes every successful upload when another document fails", async () => {
    storageMocks.upload.mockImplementation(async (filePath: string) => ({
      data: null,
      error: filePath.includes("business_registration") ? new Error("upload_failed") : null,
    }));

    await expect(uploadVerificationDocumentsWithRollback([
      {
        userId: "user-123",
        role: "restaurateur",
        documentType: "identity_document",
        file: documentFile("identity.pdf"),
        uploadId: "operation-123",
      },
      {
        userId: "user-123",
        role: "restaurateur",
        documentType: "business_registration",
        file: documentFile("business.pdf"),
        uploadId: "operation-123",
      },
    ])).rejects.toThrow("upload_failed");

    expect(storageMocks.remove).toHaveBeenCalledTimes(1);
    expect(storageMocks.remove).toHaveBeenCalledWith([
      "user-123/restaurateur/identity_document-operation-123.pdf",
    ]);
  });

  it("deduplicates cleanup paths before calling the Storage API", async () => {
    await removeVerificationDocuments(["path/document.pdf", "path/document.pdf", "", null]);

    expect(storageMocks.remove).toHaveBeenCalledWith(["path/document.pdf"]);
  });

  it("never lets a cleanup failure replace the primary operation result", async () => {
    const cleanupError = new Error("cleanup_failed");
    const onError = vi.fn(() => {
      throw new Error("diagnostic_failed");
    });
    storageMocks.remove.mockResolvedValue({ data: null, error: cleanupError });

    await expect(removeVerificationDocumentsBestEffort(["path/document.pdf"], { onError }))
      .resolves.toBe(false);
    expect(onError).toHaveBeenCalledWith(cleanupError);
  });

  it("distinguishes committed files from private orphans after an ambiguous RPC response", async () => {
    manifestMocks.in.mockResolvedValue({
      data: [{ file_path: "user/restaurateur/identity-operation.pdf" }],
      error: null,
    });

    await expect(findUncommittedVerificationDocumentPaths("user", [
      "user/restaurateur/identity-operation.pdf",
      "user/restaurateur/iban-operation.pdf",
    ])).resolves.toEqual(["user/restaurateur/iban-operation.pdf"]);
  });

  it("returns an unknown reconciliation instead of deleting when the manifest query fails", async () => {
    manifestMocks.in.mockResolvedValue({ data: null, error: new Error("network_lost") });

    await expect(findUncommittedVerificationDocumentPaths("user", [
      "user/restaurateur/identity-operation.pdf",
    ])).resolves.toBeNull();
  });
});
