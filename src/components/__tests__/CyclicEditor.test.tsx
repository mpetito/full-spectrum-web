import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CyclicEditor } from "../CyclicEditor";

const filamentColors = [
  '#808080', '#E74C3C', '#3498DB', '#2ECC71', '#F39C12',
  '#9B59B6', '#1ABC9C', '#E67E22', '#2C3E50', '#27AE60', '#C0392B',
];

describe("CyclicEditor", () => {
  it("renders entries matching pattern length", () => {
    const onChange = vi.fn();
    render(<CyclicEditor pattern={[1, 2, 3]} onChange={onChange} filamentColors={filamentColors} />);
    // 3 select elements + 1 "+" button
    const selects = screen.getAllByRole("combobox");
    expect(selects).toHaveLength(3);
  });

  it("calls onChange when entry changes", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<CyclicEditor pattern={[1, 2]} onChange={onChange} filamentColors={filamentColors} />);
    const selects = screen.getAllByRole("combobox");
    await user.selectOptions(selects[0], "3");
    expect(onChange).toHaveBeenCalledWith([3, 2]);
  });

  it("adds entry on + click", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<CyclicEditor pattern={[1, 2]} onChange={onChange} filamentColors={filamentColors} />);
    await user.click(screen.getByText("+"));
    expect(onChange).toHaveBeenCalledWith([1, 2, 1]);
  });

  it("removes entry on × click", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<CyclicEditor pattern={[1, 2, 3]} onChange={onChange} filamentColors={filamentColors} />);
    const removeButtons = screen.getAllByTitle("Remove");
    await user.click(removeButtons[1]); // Remove middle entry
    expect(onChange).toHaveBeenCalledWith([1, 3]);
  });

  it("does not show remove button when only 1 entry", () => {
    render(<CyclicEditor pattern={[1]} onChange={vi.fn()} filamentColors={filamentColors} />);
    expect(screen.queryByTitle("Remove")).toBeNull();
  });
});
