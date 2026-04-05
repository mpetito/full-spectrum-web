import { render, type RenderOptions } from "@testing-library/react";
import type { ReactElement } from "react";
import { AppProvider } from "../state/AppContext";

function Wrapper({ children }: { children: React.ReactNode }) {
  return <AppProvider>{children}</AppProvider>;
}

export function renderWithContext(
  ui: ReactElement,
  options?: Omit<RenderOptions, "wrapper">,
) {
  return render(ui, { wrapper: Wrapper, ...options });
}
