import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { ShowProgressLine } from "@/app/lissie-tool-calls";

// The lines need nothing from CopilotKit, whose v2 entry imports a stylesheet Node cannot load.
vi.mock("@copilotkit/react-core/v2", () => ({}));

describe("ShowProgressLine", () => {
  test("shows the call running", () => {
    render(<ShowProgressLine status="executing" />);

    expect(screen.getByTestId("lissie-tool-call").textContent).toBe(
      "…Counting your todos",
    );
  });

  test("leaves a counted result to the card", () => {
    const { container } = render(
      <ShowProgressLine
        status="complete"
        result={JSON.stringify({ total: 3, done: 1, open: 2 })}
      />,
    );

    expect(container.textContent).toBe("");
  });

  test("shows a failed call, such as Mastra's error text", () => {
    render(
      <ShowProgressLine
        status="complete"
        result={JSON.stringify("Lissie's tools need a signed-in user")}
      />,
    );

    expect(screen.getByTestId("lissie-tool-call").textContent).toBe(
      "✗Couldn’t count your todos",
    );
  });
});
