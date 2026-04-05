import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithContext } from "../../__tests__/test-utils";
import { ProcessingStatus } from "../ProcessingStatus";

describe("ProcessingStatus", () => {
  it('shows "Ready" for idle status', () => {
    renderWithContext(<ProcessingStatus />);
    expect(screen.getByText("Ready")).toBeInTheDocument();
  });

  // The initial state is 'idle', so we test the default render
  // Other states require dispatching actions which we test via the reducer
});
