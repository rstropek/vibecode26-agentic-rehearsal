import {
  A2UIProvider,
  A2UIRenderer,
  useA2UIActions,
} from "@copilotkit/a2ui-renderer";
import { render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { describe, expect, test } from "vitest";
import { lissieCatalog, ProgressBar } from "@/app/lissie-catalog";
import { LISSIE_CATALOG_ID } from "@/lib/lissie-tool-schemas";

describe("ProgressBar", () => {
  test("shows value out of max as a labelled progressbar", () => {
    render(<ProgressBar label="Done" value={2} max={5} />);

    const bar = screen.getByRole("progressbar", { name: "Done" });
    expect(bar.getAttribute("aria-valuenow")).toBe("2");
    expect(bar.getAttribute("aria-valuemax")).toBe("5");
    expect(bar.getAttribute("aria-valuetext")).toBe("2 of 5");
    expect(screen.getByText("2 of 5")).toBeTruthy();
    expect(bar.querySelector("div")?.style.width).toBe("40%");
  });

  test("an empty list is an empty bar, not a division by zero", () => {
    render(<ProgressBar label="Done" value={0} max={0} />);

    const bar = screen.getByRole("progressbar", { name: "Done" });
    expect(bar.getAttribute("aria-valuetext")).toBe("0 of 0");
    expect(bar.querySelector("div")?.style.width).toBe("0%");
  });

  test("keeps the value between zero and max", () => {
    render(<ProgressBar label="Done" value={7} max={4} />);

    const bar = screen.getByRole("progressbar", { name: "Done" });
    expect(bar.getAttribute("aria-valuenow")).toBe("4");
    expect(bar.querySelector("div")?.style.width).toBe("100%");
  });
});

// A surface processed by A2UI itself, as the chat does it, so the catalog's schema must make the binder resolve
// the bound props.
function Surface({
  operations,
}: {
  operations: Array<Record<string, unknown>>;
}) {
  const { processMessages } = useA2UIActions();
  useEffect(() => processMessages(operations), [processMessages, operations]);
  return <A2UIRenderer surfaceId="s" />;
}

test("the catalog's ProgressBar reads its numbers from the data model", async () => {
  const operations = [
    {
      version: "v0.9",
      createSurface: { surfaceId: "s", catalogId: LISSIE_CATALOG_ID },
    },
    {
      version: "v0.9",
      updateComponents: {
        surfaceId: "s",
        components: [
          {
            id: "root",
            component: "ProgressBar",
            label: { path: "/label" },
            value: { path: "/done" },
            max: { path: "/total" },
          },
        ],
      },
    },
    {
      version: "v0.9",
      updateDataModel: {
        surfaceId: "s",
        path: "/",
        value: { label: "Done", done: 3, total: 8 },
      },
    },
  ];

  render(
    <A2UIProvider catalog={lissieCatalog}>
      <Surface operations={operations} />
    </A2UIProvider>,
  );

  const bar = await screen.findByRole("progressbar", { name: "Done" });
  expect(bar.getAttribute("aria-valuetext")).toBe("3 of 8");
});
