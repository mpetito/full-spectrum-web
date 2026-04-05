import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithContext } from "../../__tests__/test-utils";
import { DownloadButton } from "../DownloadButton";

describe("DownloadButton", () => {
  it("is disabled when no outputBytes exist", () => {
    renderWithContext(<DownloadButton />);
    const button = screen.getByRole("button", { name: /download/i });
    expect(button).toBeDisabled();
  });

  it("renders with correct text", () => {
    renderWithContext(<DownloadButton />);
    expect(screen.getByText("Download 3MF")).toBeInTheDocument();
  });
});
