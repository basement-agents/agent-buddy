/// <reference types="@testing-library/jest-dom/vitest" />
import { expect, afterEach, vi } from "vitest";
import * as matchers from "@testing-library/jest-dom/matchers";
import { cleanup } from "@testing-library/react";

expect.extend(matchers);

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-query")>("@tanstack/react-query");
  return {
    ...actual,
    useQueryClient: () => ({
      invalidateQueries: vi.fn(),
      refetchQueries: vi.fn(),
      getQueryData: vi.fn(),
      setQueryData: vi.fn(),
      removeQueries: vi.fn(),
      cancelQueries: vi.fn(),
    }),
    useSuspenseQuery: vi.fn(() => ({ data: undefined })),
    useMutation: vi.fn(() => ({
      mutate: vi.fn(),
      mutateAsync: vi.fn(async () => ({ jobId: "test-job" })),
      isPending: false,
      isError: false,
      isSuccess: false,
      error: null,
      data: undefined,
      reset: vi.fn(),
    })),
  };
});

afterEach(() => {
  cleanup();
});
