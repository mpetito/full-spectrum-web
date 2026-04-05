import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithContext } from "../../__tests__/test-utils";
import { OutputStats } from "../OutputStats";

describe("OutputStats", () => {
  it("renders nothing when there is no result", () => {
    const { container } = renderWithContext(<OutputStats />);
    expect(container.firstChild).toBeNull();
  });
});
