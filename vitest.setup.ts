import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// `server-only` throws outside Next.js's react-server bundle, so server modules need it stubbed to run in tests.
vi.mock("server-only", () => ({}));

// Testing Library only auto-cleans when test globals are enabled, which they are not.
afterEach(() => {
  cleanup();
});
