import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BresenhamEditor } from "../BresenhamEditor";

const filamentColors = [
  '#808080', '#E74C3C', '#3498DB', '#2ECC71', '#F39C12',
  '#9B59B6', '#1ABC9C', '#E67E22', '#2C3E50', '#27AE60', '#C0392B',
];

describe("BresenhamEditor", () => {
  const twoStops = [
    { t: 0, filament: 1 },
    { t: 1, filament: 2 },
  ];

  it("renders stop entries matching stops length", () => {
    render(<BresenhamEditor stops={twoStops} onChange={vi.fn()} filamentColors={filamentColors} />);
    const inputs = screen.getAllByRole("textbox");
    expect(inputs).toHaveLength(2);
  });

  it("renders bresenham preview bar", () => {
    const { container } = render(
      <BresenhamEditor stops={twoStops} onChange={vi.fn()} filamentColors={filamentColors} />,
    );
    const bar = container.querySelector('[style*="linear-gradient"]');
    expect(bar).toBeTruthy();
  });

  it("does not show remove button when only 2 stops", () => {
    render(<BresenhamEditor stops={twoStops} onChange={vi.fn()} filamentColors={filamentColors} />);
    expect(screen.queryByTitle("Remove stop")).toBeNull();
  });

  it("shows remove buttons when more than 2 stops", () => {
    const threeStops = [...twoStops, { t: 0.5, filament: 3 }];
    render(<BresenhamEditor stops={threeStops} onChange={vi.fn()} filamentColors={filamentColors} />);
    expect(screen.getAllByTitle("Remove stop")).toHaveLength(3);
  });

  it("adds stop on + click", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<BresenhamEditor stops={twoStops} onChange={onChange} filamentColors={filamentColors} />);
    await user.click(screen.getByText("+ Add stop"));
    expect(onChange).toHaveBeenCalledWith([
      ...twoStops,
      { t: 1.0, filament: 1 },
    ]);
  });
});
