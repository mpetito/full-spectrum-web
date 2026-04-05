import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CyclicEditor } from "../CyclicEditor";

describe("CyclicEditor", () => {
  it("renders entries matching pattern length", () => {
    const onChange = vi.fn();
    render(<CyclicEditor pattern={[1, 2, 3]} onChange={onChange} />);
    // 3 select elements + 1 "+" button
    const selects = screen.getAllByRole("combobox");
    expect(selects).toHaveLength(3);
  });

  it("calls onChange when entry changes", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<CyclicEditor pattern={[1, 2]} onChange={onChange} />);
    const selects = screen.getAllByRole("combobox");
    await user.selectOptions(selects[0], "3");
    expect(onChange).toHaveBeenCalledWith([3, 2]);
  });

  it("adds entry on + click", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<CyclicEditor pattern={[1, 2]} onChange={onChange} />);
    await user.click(screen.getByText("+"));
    expect(onChange).toHaveBeenCalledWith([1, 2, 1]);
  });

  it("removes entry on × click", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<CyclicEditor pattern={[1, 2, 3]} onChange={onChange} />);
    const removeButtons = screen.getAllByTitle("Remove");
    await user.click(removeButtons[1]); // Remove middle entry
    expect(onChange).toHaveBeenCalledWith([1, 3]);
  });

  it("does not show remove button when only 1 entry", () => {
    render(<CyclicEditor pattern={[1]} onChange={vi.fn()} />);
    expect(screen.queryByTitle("Remove")).toBeNull();
  });
});
