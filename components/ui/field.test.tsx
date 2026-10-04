import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { Field } from "./field";

test("Field labels its input and passes input props through", () => {
  render(<Field label="Email" name="email" type="email" required />);

  const input = screen.getByLabelText("Email");
  expect(input.getAttribute("name")).toBe("email");
  expect(input.getAttribute("type")).toBe("email");
  expect(input.hasAttribute("required")).toBe(true);
});
