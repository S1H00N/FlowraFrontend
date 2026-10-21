import { expect, test, type Locator, type Page } from "@playwright/test";
import react from "@vitejs/plugin-react";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build, transformWithEsbuild } from "vite";

type Option = { label: string; value: string; disabled?: boolean };
type Scenario = "default" | "selected" | "disabled-selected" | "disabled" | "empty" | "async" | "long" | "dialog" | "popover";

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
    {mounted && <CustomSelect value={value} options={options} onChange={setValue} ariaLabel="Harness select" />}
    <button type="button">After select</button>
    <button type="button" style={{ position: "fixed", top: 12, right: 12, zIndex: 200 }} onClick={() => setMounted(current => !current)}>{mounted ? "Unmount select" : "Mount select"}</button>
    <output aria-label="Committed value">{value || "none"}</output>
    <output aria-label="Strict effects">{mountEffects}</output>
  </div>;
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
  return <SelectExample />;
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
