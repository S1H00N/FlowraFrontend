import { expect, test, type Locator, type Page } from "@playwright/test";
import react from "@vitejs/plugin-react";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build, transformWithEsbuild } from "vite";

type Option = { label: string; value: string; disabled?: boolean };
type Scenario = "default" | "selected" | "disabled-selected" | "disabled" | "empty" | "async" | "long" | "dialog" | "popover" | "project-work" | "quick-add";

// Bundle the real components in memory so edge cases need no application routes,
// public test props, generated files, or authentication/API fixtures.
const harnessEntry = "virtual:custom-select-harness.tsx";
const harnessSource = `
import React, { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import CustomSelect from "@/components/ui/CustomSelect";
import { FloatingPanelPortalProvider } from "@/components/ui/FloatingPanelPortal";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent } from "@/components/ui/dropdown-menu";

const scenario = new URL(location.href).searchParams.get("case");
const defaults = [
  { label: "Unavailable", value: "disabled", disabled: true },
  { label: "First enabled", value: "first" },
  { label: "Current selection", value: "selected" },
  { label: "Last enabled", value: "last" },
];

function SelectExample() {
  const [value, setValue] = useState(scenario === "selected" ? "selected" : scenario === "disabled-selected" ? "disabled" : scenario === "long" ? "item-45" : "");
  const [options, setOptions] = useState(
    scenario === "empty" ? [] : scenario === "disabled" ? defaults.map(option => ({ ...option, disabled: true })) :
    scenario === "long" ? Array.from({ length: 60 }, (_, index) => ({ label: "Item " + index, value: "item-" + index })) : defaults
  );
  const [mounted, setMounted] = useState(true);
  const [mountEffects, setMountEffects] = useState(0);
  useEffect(() => { setMountEffects(count => count + 1); }, []);
  useEffect(() => {
    if (scenario !== "async") return;
    const controller = new AbortController();
    fetch("/__custom-select/options", { signal: controller.signal }).then(response => response.json()).then(setOptions).catch(error => {
      if (error.name !== "AbortError") throw error;
    });
    return () => controller.abort();
  }, []);

  return <div style={{ display: "grid", gap: 12, maxWidth: 280 }}>
    <button type="button">Before select</button>
    {mounted && <CustomSelect value={value} options={options} onChange={setValue} ariaLabel="Harness select" contentClassName={scenario === "project-work" ? "project-work-select-menu" : undefined} />}
    <button type="button">After select</button>
    <button type="button" style={{ position: "fixed", top: 12, right: 12, zIndex: 200 }} onClick={() => setMounted(current => !current)}>{mounted ? "Unmount select" : "Mount select"}</button>
    <output aria-label="Committed value">{value || "none"}</output>
    <output aria-label="Strict effects">{mountEffects}</output>
  </div>;
}

function MenuExample() {
  return <DropdownMenu>
    <DropdownMenuTrigger>Open action menu</DropdownMenuTrigger>
    <DropdownMenuContent aria-label="Harness actions">
      <DropdownMenuItem>First action</DropdownMenuItem>
      <DropdownMenuItem>Second action</DropdownMenuItem>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>More actions</DropdownMenuSubTrigger>
        <DropdownMenuSubContent aria-label="Harness subactions">
          <DropdownMenuItem>First subaction</DropdownMenuItem>
          <DropdownMenuItem>Second subaction</DropdownMenuItem>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    </DropdownMenuContent>
  </DropdownMenu>;
}

function App() {
  const [portal, setPortal] = useState(null);
  if (scenario === "dialog") return <Dialog>
    <DialogTrigger>Open dialog</DialogTrigger>
    <DialogContent ref={setPortal} className="left-4 right-4 top-16 mx-auto w-auto" style={{ transform: "none", translate: "none" }}>
      <DialogTitle>Select dialog</DialogTitle>
      <DialogDescription>Focus scope regression fixture</DialogDescription>
      <FloatingPanelPortalProvider value={portal}><SelectExample /></FloatingPanelPortalProvider>
    </DialogContent>
  </Dialog>;
  if (scenario === "popover") return <Popover>
    <PopoverTrigger>Open popover</PopoverTrigger>
    <PopoverContent ref={setPortal} aria-label="Select popover">
      <FloatingPanelPortalProvider value={portal}><SelectExample /></FloatingPanelPortalProvider>
    </PopoverContent>
  </Popover>;
  if (scenario === "quick-add") return <div ref={setPortal} className="tasks-quick-add">
    <FloatingPanelPortalProvider value={portal}><SelectExample /></FloatingPanelPortalProvider>
  </div>;
  return <><SelectExample /><MenuExample /></>;
}
createRoot(document.getElementById("root")).render(<StrictMode><App /></StrictMode>);
`;

let harnessBundle: Promise<Map<string, string | Uint8Array>> | undefined;

function getHarnessBundle() {
  harnessBundle ??= (async () => {
    const root = fileURLToPath(new URL("../../", import.meta.url));
    const result = await build({
      configFile: false,
      root,
      base: "/__custom-select/",
      publicDir: false,
      logLevel: "error",
      // React's development build is required to exercise StrictMode effect replay.
      define: { "process.env.NODE_ENV": JSON.stringify("development") },
      resolve: { alias: { "@": fileURLToPath(new URL("../../src/", import.meta.url)) } },
      plugins: [react(), {
        name: "custom-select-regression-harness",
        resolveId(id) { if (id === harnessEntry) return `\0${harnessEntry}`; },
        async load(id) {
          if (id === `\0${harnessEntry}`) {
            return transformWithEsbuild(harnessSource, harnessEntry, { loader: "tsx", jsx: "automatic" });
          }
        },
      }],
      build: {
        write: false,
        minify: false,
        rollupOptions: { input: harnessEntry, output: { entryFileNames: "harness.js", inlineDynamicImports: true } },
      },
    });
    if ("on" in result) throw new Error("The select harness must use a finite build");
    const outputs = Array.isArray(result) ? result : [result];
    return new Map(outputs.flatMap(bundle => bundle.output.map(output => [
      `/__custom-select/${output.fileName}`,
      output.type === "chunk" ? output.code : output.source,
    ] as const)));
  })();
  return harnessBundle;
}

async function mountSelect(page: Page, scenario: Scenario = "default", options?: Promise<Option[]>) {
  const [assets, applicationHtml] = await Promise.all([
    getHarnessBundle(),
    readFile(new URL("../../dist/qa/index.html", import.meta.url), "utf8"),
  ]);
  // Reuse the preview server's real application CSS instead of rebuilding
  // Tailwind in each browser worker before the first interaction.
  const styles = [...applicationHtml.matchAll(/<link\b[^>]*\bhref=["']([^"']+\.css(?:\?[^"']*)?)["'][^>]*>/gi)].map(match => match[1]);
  if (styles.length === 0) throw new Error("The built QA application has no stylesheet for the select harness");
  await page.route("**/__custom-select/**", async route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.endsWith("/options") && options) {
      await route.fulfill({ json: await options });
    } else if (pathname === "/__custom-select/") {
      await route.fulfill({
        contentType: "text/html",
        body: `<!doctype html><html><head>${styles.map(href => `<link rel="stylesheet" href="${href}">`).join("")}</head><body><main id="root" style="margin:32px 20px"></main><script type="module" src="/__custom-select/harness.js"></script></body></html>`,
      });
    } else {
      const body = assets.get(pathname);
      if (body === undefined) throw new Error(`Unexpected select fixture request: ${pathname}`);
      await route.fulfill({ contentType: pathname.endsWith(".css") ? "text/css" : "text/javascript", body: typeof body === "string" ? body : Buffer.from(body) });
    }
  });
  await page.goto(`/__custom-select/?case=${scenario}`);
  if (scenario === "dialog") await page.getByRole("button", { name: "Open dialog", exact: true }).click();
  if (scenario === "popover") await page.getByRole("button", { name: "Open popover", exact: true }).click();
  const trigger = page.getByRole("button", { name: "Harness select", exact: true });
  await expect(trigger).toBeVisible();
  await expect.poll(async () => Number(await page.getByLabel("Strict effects").textContent())).toBeGreaterThanOrEqual(2);
  return { trigger, menu: page.getByRole("listbox", { name: "Harness select", exact: true }) };
}

async function openWithKeyboard(page: Page, trigger: Locator) {
  // Reach the trigger through the browser's tab order; no synthetic focus.
  await page.getByRole("button", { name: "Before select", exact: true }).click();
  await page.keyboard.press("Tab");
  await expect(trigger).toBeFocused();
  await page.keyboard.press("Enter");
}

test("CustomSelect uses enabled options and supports keyboard selection in StrictMode", async ({ page }) => {
  const { trigger, menu } = await mountSelect(page);
  await openWithKeyboard(page, trigger);
  await expect(menu).toBeVisible();
  await expect(page.getByRole("option", { name: "First enabled", exact: true })).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(page.getByRole("option", { name: "Last enabled", exact: true })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("option", { name: "First enabled", exact: true })).toBeFocused();
  await page.keyboard.press("End");
  await expect(page.getByRole("option", { name: "Last enabled", exact: true })).toBeFocused();
  await page.keyboard.press("Home");
  await expect(page.getByRole("option", { name: "First enabled", exact: true })).toBeFocused();
  await page.keyboard.press("Space");
  await expect(menu).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(page.getByLabel("Committed value")).toHaveText("first");
});

for (const scenario of ["selected", "disabled-selected"] as const) {
  test(`CustomSelect initially focuses the ${scenario === "selected" ? "selected enabled" : "first enabled when the selection is disabled"} option`, async ({ page }) => {
    const { trigger, menu } = await mountSelect(page, scenario);
    await trigger.click();
    await expect(menu).toBeVisible();
    await expect(page.getByRole("option", { name: scenario === "selected" ? "Current selection" : "First enabled", exact: true })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });
}

for (const scenario of ["disabled", "empty"] as const) {
  test(`CustomSelect handles ${scenario} options without focusing a disabled option`, async ({ page }) => {
    const { trigger, menu } = await mountSelect(page, scenario);
    await openWithKeyboard(page, trigger);
    await expect(menu).toBeVisible();
    await expect(menu).toBeFocused();
    await expect(menu.getByRole("option")).toHaveCount(scenario === "empty" ? 0 : 4);
    await page.keyboard.press("ArrowDown");
    await expect(menu).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });
}

test("CustomSelect recovers focus after asynchronously replacing open options", async ({ page }) => {
  let replaceOptions!: (options: Option[]) => void;
  const options = new Promise<Option[]>(resolve => { replaceOptions = resolve; });
  const { trigger, menu } = await mountSelect(page, "async", options);
  await trigger.click();
  await expect(page.getByRole("option", { name: "First enabled", exact: true })).toBeFocused();
  replaceOptions([
    { label: "New disabled", value: "new-disabled", disabled: true },
    { label: "New enabled", value: "new-enabled" },
  ]);
  await expect(menu.getByRole("option")).toHaveCount(2);
  await expect(page.getByRole("option", { name: "New enabled", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(menu).toHaveCount(0);
  await expect(page.getByLabel("Committed value")).toHaveText("new-enabled");
  await expect(trigger).toBeFocused();
});

test("CustomSelect moves focus when an existing focused option becomes disabled", async ({ page }) => {
  let replaceOptions!: (options: Option[]) => void;
  const options = new Promise<Option[]>(resolve => { replaceOptions = resolve; });
  const { trigger, menu } = await mountSelect(page, "async", options);
  await trigger.click();
  const previousOption = page.getByRole("option", { name: "First enabled", exact: true });
  await expect(previousOption).toBeFocused();
  replaceOptions([
    { label: "Unavailable", value: "disabled", disabled: true },
    { label: "First enabled", value: "first", disabled: true },
    { label: "Current selection", value: "selected" },
    { label: "Last enabled", value: "last" },
  ]);
  await expect(previousOption).toBeDisabled();
  await expect(page.getByRole("option", { name: "Current selection", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(menu).toHaveCount(0);
  await expect(page.getByLabel("Committed value")).toHaveText("selected");
  await expect(trigger).toBeFocused();
});

test("CustomSelect focuses its listbox when asynchronous options become empty", async ({ page }) => {
  let replaceOptions!: (options: Option[]) => void;
  const options = new Promise<Option[]>(resolve => { replaceOptions = resolve; });
  const { trigger, menu } = await mountSelect(page, "async", options);
  await trigger.click();
  await expect(page.getByRole("option", { name: "First enabled", exact: true })).toBeFocused();
  replaceOptions([]);
  await expect(menu.getByRole("option")).toHaveCount(0);
  await expect(menu).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("CustomSelect Tab and Shift+Tab return to the adjacent controls", async ({ page }) => {
  const { trigger, menu } = await mountSelect(page);
  await openWithKeyboard(page, trigger);
  await expect(page.getByRole("option", { name: "First enabled", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(menu).toHaveCount(0);
  await expect(page.getByRole("button", { name: "After select", exact: true })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(trigger).toBeFocused();
  await page.keyboard.press("Space");
  await expect(page.getByRole("option", { name: "First enabled", exact: true })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(menu).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Before select", exact: true })).toBeFocused();
});

for (const scenario of ["dialog", "popover"] as const) {
  test(`CustomSelect Escape closes only the nested menu in a ${scenario}`, async ({ page }) => {
    const { trigger, menu } = await mountSelect(page, scenario);
    const container = page.getByRole("dialog", { name: scenario === "dialog" ? "Select dialog" : "Select popover", exact: true });
    await openWithKeyboard(page, trigger);
    await expect(menu).toBeVisible();
    await expect(page.getByRole("option", { name: "First enabled", exact: true })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(container).toBeVisible();
    await expect(trigger).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(container).toHaveCount(0);
    await expect(page.getByRole("button", { name: scenario === "dialog" ? "Open dialog" : "Open popover", exact: true })).toBeFocused();
  });
}

test("CustomSelect scrolls a long list while preserving page position through resize", async ({ page }) => {
  const { trigger, menu } = await mountSelect(page, "long");
  const originalScroll = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
  await trigger.click();
  const selected = page.getByRole("option", { name: "Item 45", exact: true });
  await expect(selected).toBeFocused();
  await expect.poll(() => selected.evaluate(option => {
    const menuRect = option.parentElement!.getBoundingClientRect();
    const optionRect = option.getBoundingClientRect();
    return optionRect.top >= menuRect.top && optionRect.bottom <= menuRect.bottom;
  })).toBe(true);
  expect(await menu.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  await page.setViewportSize({ width: 360, height: 640 });
  await expect(selected).toBeFocused();
  await expect.poll(() => menu.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight;
  })).toBe(true);
  expect(await page.evaluate(() => ({ x: scrollX, y: scrollY }))).toEqual(originalScroll);
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
});

test("CustomSelect supports touch or mouse selection, outside dismissal, rapid toggling and unmount", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const { trigger, menu } = await mountSelect(page);
  const activate = (locator: Locator) => testInfo.project.use.hasTouch ? locator.tap() : locator.click();
  await activate(trigger);
  await expect(menu).toBeVisible();
  await activate(page.getByRole("option", { name: "Last enabled", exact: true }));
  await expect(menu).toHaveCount(0);
  await expect(page.getByLabel("Committed value")).toHaveText("last");
  await activate(trigger);
  await expect(page.getByRole("option", { name: "Last enabled", exact: true })).toBeFocused();
  await activate(page.getByRole("button", { name: "Before select", exact: true }));
  await expect(menu).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Before select", exact: true })).toBeFocused();
  await trigger.dblclick();
  await expect(menu).toHaveCount(0);
  await activate(trigger);
  await expect(menu).toBeVisible();
  await activate(page.getByRole("button", { name: "Unmount select", exact: true }));
  await expect(trigger).toHaveCount(0);
  await expect(menu).toHaveCount(0);
  await page.setViewportSize({ width: 375, height: 700 });
  await activate(page.getByRole("button", { name: "Mount select", exact: true }));
  await activate(trigger);
  await expect(page.getByRole("option", { name: "Last enabled", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(errors).toEqual([]);
});

async function readPaint(locator: Locator) {
  return locator.evaluate(element => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d")!;
    const rgba = (color: string) => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      return [...context.getImageData(0, 0, 1, 1).data];
    };
    const style = getComputedStyle(element);
    const background = rgba(style.backgroundColor);
    const shadowColors = style.boxShadow.match(/(?:rgba?|hsla?|oklab|oklch|color)\([^)]*\)/g) || [];
    const shadows = shadowColors.map(rgba).filter(color => color[3] > 0);
    const ancestors: Element[] = [];
    for (let current: Element | null = element; current; current = current.parentElement) ancestors.unshift(current);
    context.clearRect(0, 0, 1, 1);
    for (const ancestor of ancestors) {
      context.fillStyle = getComputedStyle(ancestor).backgroundColor;
      context.fillRect(0, 0, 1, 1);
    }
    return {
      background,
      composite: [...context.getImageData(0, 0, 1, 1).data],
      shadows,
      transitionSeconds: style.transitionDuration.split(",").map(value => parseFloat(value)),
    };
  });
}

async function expectOpaqueSurface(locator: Locator, theme: "light" | "dark") {
  const paint = await readPaint(locator);
  expect(paint.background[3], "floating surfaces must fully cover content below them").toBe(255);
  if (theme === "dark") {
    expect(Math.max(...paint.background.slice(0, 3)), "dark surfaces must not flash a light background").toBeLessThanOrEqual(64);
    for (const shadow of paint.shadows) {
      expect(Math.max(...shadow.slice(0, 3)), "dark floating panels must not retain a light halo").toBeLessThanOrEqual(64);
    }
  } else {
    expect(Math.min(...paint.background.slice(0, 3))).toBeGreaterThanOrEqual(240);
  }
}

test("CustomSelect keeps pointer and keyboard focus aligned during mixed input", async ({ page }) => {
  const { trigger, menu } = await mountSelect(page);
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await trigger.click();
  const first = menu.getByRole("option", { name: "First enabled", exact: true });
  const middle = menu.getByRole("option", { name: "Current selection", exact: true });
  const last = menu.getByRole("option", { name: "Last enabled", exact: true });
  await expect(first).toBeFocused();
  await last.hover();
  await expect(last).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(menu).toHaveCount(0);
  await expect(page.getByLabel("Committed value")).toHaveText("last");
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(last).toBeFocused();
  await expect(last).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Home");
  await expect(first).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(middle).toBeFocused();
  expect((await readPaint(first)).background[3], "keyboard movement must clear the previous unselected highlight").toBe(0);
  expect((await readPaint(middle)).background[3]).toBeGreaterThan(0);
  await page.keyboard.press("Enter");
  await expect(menu).toHaveCount(0);
  await expect(page.getByLabel("Committed value")).toHaveText("selected");
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(middle).toBeFocused();
  await expect(middle).toHaveAttribute("aria-selected", "true");
  await expect(last).toHaveAttribute("aria-selected", "false");
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
});

for (const theme of ["light", "dark"] as const) {
  for (const scenario of ["default", "project-work", "quick-add"] as const) {
    test(`CustomSelect ${scenario} clears previous hover highlights immediately in ${theme} mode`, async ({ page }) => {
      const { trigger, menu } = await mountSelect(page, scenario);
      await page.evaluate(dark => document.documentElement.classList.toggle("dark", dark), theme === "dark");
      await trigger.click();
      const first = menu.getByRole("option", { name: "First enabled", exact: true });
      const next = menu.getByRole("option", { name: "Last enabled", exact: true });
      await expect(first).toBeFocused();
      await expectOpaqueSurface(menu, theme);
      if (theme === "dark") {
        await expect.poll(async () => (await readPaint(trigger)).shadows.every(color => Math.min(...color.slice(0, 3)) < 128), "dark select triggers must not retain pale shadows or focus rings").toBe(true);
        expect(Math.max(...(await readPaint(first)).composite.slice(0, 3)), "active options must use a dark theme highlight").toBeLessThanOrEqual(96);
      }
      await next.hover();
      expect((await readPaint(first)).background[3], "the previous focused option must not leave a second highlight").toBe(0);
      expect((await readPaint(first)).transitionSeconds.every(duration => duration === 0), "option colors must update without trailing transitions").toBe(true);
      expect((await readPaint(next)).background[3]).toBeGreaterThan(0);
      if (theme === "dark") {
        expect(Math.max(...(await readPaint(next)).composite.slice(0, 3))).toBeLessThanOrEqual(96);
      }
      await page.keyboard.press("Escape");
      await expect(menu).toHaveCount(0);
      await expect(trigger).toBeFocused();
      await trigger.click();
      await expect(first).toBeFocused();
      expect((await readPaint(next)).background[3], "reopening must clear the previous pointer highlight").toBe(0);
      await expectOpaqueSurface(menu, theme);
      await page.getByRole("button", { name: "Unmount select", exact: true }).click();
      await expect(menu).toHaveCount(0);
    });
  }

  test(`Popover and nested select fully cover underlying content in ${theme} mode`, async ({ page }) => {
    const { trigger, menu } = await mountSelect(page, "popover");
    await page.evaluate(dark => document.documentElement.classList.toggle("dark", dark), theme === "dark");
    const popover = page.getByRole("dialog", { name: "Select popover", exact: true });
    await expectOpaqueSurface(popover, theme);
    await trigger.click();
    await expect(menu).toBeVisible();
    await expectOpaqueSurface(menu, theme);
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(popover).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(popover).toHaveCount(0);
    await page.getByRole("button", { name: "Open popover", exact: true }).click();
    await expectOpaqueSurface(popover, theme);
    await expect(menu).toHaveCount(0);
  });

  test(`DropdownMenu and submenu keep opaque surfaces and clear item highlights in ${theme} mode`, async ({ page }) => {
    await mountSelect(page);
    await page.evaluate(dark => document.documentElement.classList.toggle("dark", dark), theme === "dark");
    const trigger = page.getByRole("button", { name: "Open action menu", exact: true });
    await trigger.focus();
    await page.keyboard.press("Enter");
    const menu = page.getByRole("menu", { name: "Open action menu", exact: true });
    const first = menu.getByRole("menuitem", { name: "First action", exact: true });
    const second = menu.getByRole("menuitem", { name: "Second action", exact: true });
    await expect(first).toBeFocused();
    await expectOpaqueSurface(menu, theme);
    await page.keyboard.press("ArrowDown");
    await expect(second).toBeFocused();
    expect((await readPaint(first)).background[3]).toBe(0);
    expect((await readPaint(first)).transitionSeconds.every(duration => duration === 0)).toBe(true);
    await page.keyboard.press("ArrowDown");
    await expect(menu.getByRole("menuitem", { name: "More actions", exact: true })).toBeFocused();
    await page.keyboard.press("ArrowRight");
    const submenu = page.getByRole("menu", { name: "More actions", exact: true });
    await expect(submenu).toBeVisible();
    await expectOpaqueSurface(submenu, theme);
    const firstSubaction = submenu.getByRole("menuitem", { name: "First subaction", exact: true });
    await expect(firstSubaction).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(submenu.getByRole("menuitem", { name: "Second subaction", exact: true })).toBeFocused();
    expect((await readPaint(firstSubaction)).background[3]).toBe(0);
    expect((await readPaint(firstSubaction)).transitionSeconds.every(duration => duration === 0)).toBe(true);
    await page.keyboard.press("ArrowLeft");
    await expect(submenu).toHaveCount(0);
    await expect(menu).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(first).toBeFocused();
    await expectOpaqueSurface(menu, theme);
    expect((await readPaint(second)).background[3]).toBe(0);
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
  });
}

test("CustomSelect preserves keyboard highlight when reopening beneath a stationary pointer", async ({ page }) => {
  const { trigger, menu } = await mountSelect(page);
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await trigger.click();
  const first = menu.getByRole("option", { name: "First enabled", exact: true });
  const last = menu.getByRole("option", { name: "Last enabled", exact: true });
  await expect(menu).toBeVisible();
  const lastBounds = await last.boundingBox();
  if (!lastBounds) throw new Error("The last option must have a visible position");
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);

  // Position the pointer before opening; no pointer movement should replace
  // the option initialized by keyboard focus when the menu appears below it.
  await page.mouse.move(lastBounds.x + lastBounds.width / 2, lastBounds.y + lastBounds.height / 2);
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(first).toBeFocused();
  await page.evaluate(() => new Promise<void>(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
  await expect(first).toHaveAttribute("data-highlighted", "");
  await expect(last).not.toHaveAttribute("data-highlighted");
  await page.keyboard.press("Enter");
  await expect(menu).toHaveCount(0);
  await expect(page.getByLabel("Committed value")).toHaveText("first");
  await expect(trigger).toBeFocused();
});
