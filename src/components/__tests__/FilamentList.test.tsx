import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithContext } from "../../__tests__/test-utils";
import { FilamentList } from "../FilamentList";

describe("FilamentList", () => {
  it("renders nothing when there is no meshData", () => {
    const { container } = renderWithContext(<FilamentList />);
    expect(container.firstChild).toBeNull();
  });
});
