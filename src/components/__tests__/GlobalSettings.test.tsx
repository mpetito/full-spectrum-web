import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithContext } from "../../__tests__/test-utils";
import { GlobalSettings } from "../GlobalSettings";

describe("GlobalSettings", () => {
  it("renders settings heading", () => {
    renderWithContext(<GlobalSettings />);
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  it("renders layer height slider", () => {
    renderWithContext(<GlobalSettings />);
    expect(screen.getByLabelText(/layer height/i)).toBeInTheDocument();
  });

  it("renders target format selector", () => {
    renderWithContext(<GlobalSettings />);
    expect(screen.getByLabelText(/target format/i)).toBeInTheDocument();
  });

  it("renders boundary split checkbox", () => {
    renderWithContext(<GlobalSettings />);
    expect(screen.getByLabelText(/boundary split/i)).toBeInTheDocument();
  });

  it("shows max split depth when boundary split is enabled", () => {
    renderWithContext(<GlobalSettings />);
    // Default config has boundarySplit: true
    expect(screen.getByLabelText(/max split depth/i)).toBeInTheDocument();
  });
});
