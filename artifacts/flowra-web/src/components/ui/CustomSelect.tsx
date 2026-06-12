import { Check, ChevronDown } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

export type CustomSelectValue = string | number;

export interface CustomSelectOption<TValue extends CustomSelectValue> {
  label: string;
  value: TValue;
  icon?: ReactNode;
  colorDot?: string;
  description?: string;
  disabled?: boolean;
}

interface CustomSelectProps<TValue extends CustomSelectValue> {
  value: TValue;
  options: readonly CustomSelectOption<TValue>[];
  onChange: (value: TValue) => void;
  onPreviewChange?: (value: TValue | null) => void;
  ariaLabel: string;
  fieldLabel?: string;
  triggerLabel?: string;
  triggerIcon?: ReactNode;
  triggerColorDot?: string | null;
  placeholder?: string;
  disabled?: boolean;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  sideOffset?: number;
  floatingBoundary?: "trigger" | "panel";
  className?: string;
  contentClassName?: string;
  menuTone?: "light" | "dark";
}

export default function CustomSelect<TValue extends CustomSelectValue>({
  value,
  options,
  onChange,
  onPreviewChange,
  ariaLabel,
  fieldLabel,
  triggerLabel,
  triggerIcon,
  triggerColorDot,
  placeholder = "선택",
  disabled = false,
  side = "bottom",
  align = "start",
  sideOffset = 7,
  floatingBoundary = "trigger",
  className,
  contentClassName,
  menuTone = "light",
}: CustomSelectProps<TValue>) {
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const previewValueRef = useRef<TValue | null>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [menuStyle, setMenuStyle] = useState<CSSProperties | null>(null);
  const selectedOption = options.find((option) => option.value === value);
  const selectedIndex = options.findIndex((option) => option.value === value);
  const enabledIndexes = useMemo(
    () =>
      options
        .map((option, index) => (option.disabled ? -1 : index))
        .filter((index) => index >= 0),
    [options],
  );
  const firstEnabledIndex = enabledIndexes[0] ?? -1;
  const hasValue = Boolean(selectedOption);
  const triggerText = triggerLabel ?? selectedOption?.label ?? placeholder;
  const hasTriggerColorDot =
    typeof triggerColorDot === "string" && triggerColorDot.length > 0;
  const darkMenu = menuTone === "dark";

  const updateMenuPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger || typeof window === "undefined") return;

    const margin = 10;
    const rect = trigger.getBoundingClientRect();
    const panelRect =
      floatingBoundary === "panel"
        ? trigger.closest("aside")?.getBoundingClientRect()
        : null;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const width = Math.min(
      Math.max(rect.width, 224),
      Math.max(160, viewportWidth - margin * 2),
    );
    const maxHeight = Math.min(288, Math.max(140, viewportHeight - margin * 2));

    if (viewportWidth < 640) {
      setMenuStyle({
        left: margin,
        top: Math.max(margin, viewportHeight - maxHeight - margin),
        width: viewportWidth - margin * 2,
        maxHeight,
      });
      return;
    }

    const boundaryLeft = panelRect?.left ?? rect.left;
    const boundaryRight = panelRect?.right ?? rect.right;
    const boundaryTop = panelRect?.top ?? rect.top;
    const boundaryBottom = panelRect?.bottom ?? rect.bottom;
    const sideGap = sideOffset;

    const alignedLeft = () => {
      if (align === "center") return rect.left + rect.width / 2 - width / 2;
      if (align === "end") return rect.right - width;
      return rect.left;
    };
    const alignedTop = () => {
      if (align === "center") return rect.top + rect.height / 2 - maxHeight / 2;
      if (align === "end") return rect.bottom - maxHeight;
      return rect.top;
    };
    const placementOrder: Array<"right" | "left" | "bottom" | "top"> =
      side === "right"
        ? ["right", "left", "bottom", "top"]
        : side === "left"
          ? ["left", "right", "bottom", "top"]
          : side === "top"
            ? ["top", "right", "left", "bottom"]
            : ["bottom", "right", "left", "top"];
    const positionFor = (placement: "right" | "left" | "bottom" | "top") => {
      if (placement === "right") {
        return { left: boundaryRight + sideGap, top: alignedTop() };
      }
      if (placement === "left") {
        return { left: boundaryLeft - width - sideGap, top: alignedTop() };
      }
      if (placement === "top") {
        return { left: alignedLeft(), top: boundaryTop - maxHeight - sideGap };
      }
      return { left: alignedLeft(), top: boundaryBottom + sideGap };
    };
    const fits = ({ left, top }: { left: number; top: number }) =>
      left >= margin &&
      left + width <= viewportWidth - margin &&
      top >= margin &&
      top + maxHeight <= viewportHeight - margin;
    const fitsHorizontally = ({ left }: { left: number }) =>
      left >= margin && left + width <= viewportWidth - margin;
    const preferredPosition =
      placementOrder.map(positionFor).find(fits) ??
      placementOrder.map(positionFor).find(fitsHorizontally) ??
      positionFor(side);

    const left = Math.min(
      Math.max(margin, preferredPosition.left),
      Math.max(margin, viewportWidth - width - margin),
    );
    const top = Math.min(
      Math.max(margin, preferredPosition.top),
      Math.max(margin, viewportHeight - maxHeight - margin),
    );

    setMenuStyle({
      left: Math.round(left),
      top: Math.round(top),
      width: Math.round(width),
      maxHeight: Math.round(maxHeight),
    });
  }, [align, floatingBoundary, side, sideOffset]);

  useEffect(() => {
    if (!open) {
      setMenuStyle(null);
      return;
    }

    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);

    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open, updateMenuPosition]);

  useEffect(() => {
    if (!open) return;

    const nextActiveIndex =
      selectedIndex >= 0 && !options[selectedIndex]?.disabled
        ? selectedIndex
        : firstEnabledIndex;
    setActiveIndex(nextActiveIndex);

    const focusFrame = window.requestAnimationFrame(() => {
      if (nextActiveIndex >= 0) {
        optionRefs.current[nextActiveIndex]?.focus();
      } else {
        menuRef.current?.focus();
      }
    });

    return () => window.cancelAnimationFrame(focusFrame);
  }, [firstEnabledIndex, open, options, selectedIndex]);

  useEffect(() => {
    if (!open) return;

    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        (triggerRef.current?.contains(target) ||
          menuRef.current?.contains(target))
      ) {
        return;
      }

      setOpen(false);
    };

    document.addEventListener("pointerdown", closeOnOutsidePointer, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer, true);
    };
  }, [open]);

  const focusTrigger = useCallback(() => {
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  const clearPreview = useCallback(() => {
    if (previewValueRef.current === null) return;
    previewValueRef.current = null;
    onPreviewChange?.(null);
  }, [onPreviewChange]);

  const previewOption = useCallback(
    (option: CustomSelectOption<TValue>) => {
      if (option.disabled) return;
      if (Object.is(previewValueRef.current, option.value)) return;
      previewValueRef.current = option.value;
      onPreviewChange?.(option.value);
    },
    [onPreviewChange],
  );

  useEffect(() => {
    if (!open) clearPreview();
  }, [clearPreview, open]);

  const commitOption = useCallback(
    (option: CustomSelectOption<TValue>) => {
      if (option.disabled) return;
      clearPreview();
      onChange(option.value);
      setOpen(false);
      focusTrigger();
    },
    [clearPreview, focusTrigger, onChange],
  );

  const focusOption = useCallback((index: number) => {
    if (index < 0) return;
    setActiveIndex(index);
    window.requestAnimationFrame(() => optionRefs.current[index]?.focus());
  }, []);

  const moveActiveOption = useCallback(
    (direction: 1 | -1) => {
      if (enabledIndexes.length === 0) return;
      const currentEnabledPosition = enabledIndexes.indexOf(activeIndex);
      const basePosition =
        currentEnabledPosition >= 0
          ? currentEnabledPosition
          : direction > 0
            ? -1
            : 0;
      const nextPosition =
        (basePosition + direction + enabledIndexes.length) %
        enabledIndexes.length;
      focusOption(enabledIndexes[nextPosition]);
    },
    [activeIndex, enabledIndexes, focusOption],
  );

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (
      event.key === "Enter" ||
      event.key === " " ||
      event.key === "ArrowDown" ||
      event.key === "ArrowUp"
    ) {
      event.preventDefault();
      if (!open) {
        setOpen(true);
      } else if (event.key === "ArrowUp") {
        moveActiveOption(-1);
      } else {
        moveActiveOption(1);
      }
    }

    if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
    }
  };

  const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveActiveOption(1);
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveActiveOption(-1);
    }
    if (event.key === "Home") {
      event.preventDefault();
      focusOption(firstEnabledIndex);
    }
    if (event.key === "End") {
      event.preventDefault();
      focusOption(enabledIndexes[enabledIndexes.length - 1] ?? -1);
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const activeOption = options[activeIndex];
      if (activeOption) commitOption(activeOption);
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      focusTrigger();
    }
    if (event.key === "Tab") {
      setOpen(false);
    }
  };

  const menu =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            id={menuId}
            ref={menuRef}
            role="listbox"
            aria-label={ariaLabel}
            tabIndex={-1}
            data-state="open"
            data-side={side}
            onKeyDown={handleMenuKeyDown}
            onMouseLeave={clearPreview}
            style={{
              ...(menuStyle ?? {
                left: 0,
                top: 0,
                width: 224,
                maxHeight: 288,
                visibility: "hidden",
              }),
              position: "fixed",
            }}
            className={cn(
              "z-[130] min-w-56 overflow-y-auto overflow-x-hidden rounded-xl border p-1.5 shadow-2xl outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
              darkMenu
                ? "border-zinc-800 bg-zinc-950 text-zinc-100 shadow-zinc-950/30"
                : "border-slate-200 bg-white text-slate-900 shadow-slate-200/80",
              contentClassName,
            )}
          >
            {options.map((option, index) => {
              const selected = option.value === value;
              const active = activeIndex === index;

              return (
                <button
                  key={String(option.value)}
                  ref={(node) => {
                    optionRefs.current[index] = node;
                  }}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  disabled={option.disabled}
                  onClick={() => commitOption(option)}
                  onMouseEnter={() => {
                    if (!option.disabled) {
                      setActiveIndex(index);
                      previewOption(option);
                    }
                  }}
                  onFocus={() => {
                    if (!option.disabled) {
                      setActiveIndex(index);
                      previewOption(option);
                    }
                  }}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm outline-none transition disabled:cursor-not-allowed disabled:opacity-50",
                    darkMenu
                      ? "text-zinc-200 hover:bg-white/10 hover:text-white focus:bg-white/10 focus:text-white"
                      : "hover:bg-violet-50/70 focus:bg-violet-50/70 focus:text-slate-950",
                    active &&
                      (darkMenu
                        ? "bg-white/10 text-white"
                        : "bg-violet-50/70 text-slate-950"),
                    selected &&
                      (darkMenu
                        ? "bg-white/10 text-white"
                        : "bg-violet-50 text-violet-700"),
                  )}
                >
                  <OptionMarker option={option} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">
                      {option.label}
                    </span>
                    {option.description ? (
                      <span
                        className={cn(
                          "mt-0.5 block truncate text-xs font-medium",
                          darkMenu ? "text-zinc-500" : "text-slate-500",
                        )}
                      >
                        {option.description}
                      </span>
                    ) : null}
                  </span>
                  <span
                    className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center",
                      darkMenu ? "text-violet-400" : "text-violet-600",
                    )}
                  >
                    {selected ? <Check className="h-4 w-4" /> : null}
                  </span>
                </button>
              );
            })}
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={disabled}
        data-state={open ? "open" : "closed"}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={handleTriggerKeyDown}
        className={cn(
          "group flex h-11 w-full cursor-pointer items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3.5 text-left text-sm shadow-sm shadow-slate-200/40 outline-none transition",
          "hover:border-slate-300 hover:shadow-md hover:shadow-slate-200/50",
          "focus-visible:border-violet-400 focus-visible:ring-2 focus-visible:ring-violet-100",
          "data-[state=open]:border-violet-400 data-[state=open]:ring-2 data-[state=open]:ring-violet-100",
          "disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 disabled:shadow-none",
          className,
        )}
      >
        <span
          className={cn(
            "flex min-w-0 flex-1",
            fieldLabel
              ? "flex-col items-start gap-0.5"
              : "items-center gap-2.5",
          )}
        >
          {fieldLabel ? (
            <span className="max-w-full truncate text-[11px] font-semibold leading-4 text-slate-500">
              {fieldLabel}
            </span>
          ) : null}
          <span className="flex max-w-full min-w-0 items-center gap-2.5">
            {triggerIcon ? (
              <span className="flex h-5 w-5 shrink-0 items-center justify-center text-slate-500">
                {triggerIcon}
              </span>
            ) : triggerLabel || hasTriggerColorDot ? null : (
              <OptionMarker option={selectedOption} muted={!hasValue} />
            )}
            {hasTriggerColorDot ? (
              <span
                aria-hidden
                className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/10"
                style={{ backgroundColor: triggerColorDot }}
              />
            ) : null}
            <span
              className={cn(
                "min-w-0 truncate",
                triggerIcon ? "text-xs font-medium" : "font-semibold",
                triggerIcon
                  ? "text-slate-700"
                  : hasValue || triggerLabel
                    ? "text-slate-900"
                    : "text-slate-400",
              )}
            >
              {triggerText}
            </span>
          </span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition group-data-[state=open]:rotate-180 group-data-[state=open]:text-violet-500" />
      </button>
      {menu}
    </>
  );
}

function OptionMarker<TValue extends CustomSelectValue>({
  option,
  muted = false,
}: {
  option?: CustomSelectOption<TValue>;
  muted?: boolean;
}) {
  if (option?.icon) {
    return (
      <span
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center text-slate-500",
          muted && "text-slate-300",
        )}
      >
        {option.icon}
      </span>
    );
  }

  if (option?.colorDot) {
    return (
      <span
        aria-hidden
        className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/10"
        style={{ backgroundColor: option.colorDot }}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={cn(
        "h-2.5 w-2.5 shrink-0 rounded-full border border-dashed border-slate-300",
        muted && "border-slate-200",
      )}
    />
  );
}
