import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";

const FloatingPanelContainer = createContext<HTMLElement | null>(null);

export const FloatingPanelPortalProvider = FloatingPanelContainer.Provider;

// Keep floating controls inside their dialog's focus and pointer scope.
// Existing pages without a provider continue to render into document.body.
export function FloatingPanelPortal({ children }: { children: ReactNode }) {
  const container = useContext(FloatingPanelContainer);
  if (typeof document === "undefined") return null;
  return createPortal(children, container ?? document.body);
}
