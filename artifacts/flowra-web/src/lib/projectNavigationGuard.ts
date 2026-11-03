type ProjectHistoryGuard = (event: PopStateEvent) => void;

let installed = false;
let activeGuard: ProjectHistoryGuard | null = null;
let activeNavigationGuard: (() => boolean) | null = null;

export function installProjectHistoryGuard() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  // Register before BrowserRouter mounts: its POP listener can synchronously
  // unmount a form and remove a listener registered by that form's effect.
  window.addEventListener("popstate", (event) => activeGuard?.(event), true);
}

export function registerProjectHistoryGuard(guard: ProjectHistoryGuard, mayNavigate?: () => boolean) {
  activeGuard = guard;
  activeNavigationGuard = mayNavigate ?? null;
  return () => {
    if (activeGuard === guard) {
      activeGuard = null;
      activeNavigationGuard = null;
    }
  };
}

export function allowGuardedNavigation() {
  return activeNavigationGuard?.() ?? true;
}
