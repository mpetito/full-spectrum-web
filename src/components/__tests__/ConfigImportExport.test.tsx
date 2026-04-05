import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithContext } from "../../__tests__/test-utils";
import { ConfigImportExport } from "../ConfigImportExport";

describe("ConfigImportExport", () => {
  it("renders export button", () => {
    renderWithContext(<ConfigImportExport />);
    expect(screen.getByText("Export")).toBeInTheDocument();
  });

  it("renders import button", () => {
    renderWithContext(<ConfigImportExport />);
    expect(screen.getByText("Import")).toBeInTheDocument();
  });
});
