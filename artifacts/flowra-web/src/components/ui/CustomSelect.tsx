import { Check, ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  ariaLabel: string;
  placeholder?: string;
  disabled?: boolean;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  sideOffset?: number;
  className?: string;
  contentClassName?: string;
}

export default function CustomSelect<TValue extends CustomSelectValue>({
  value,
  options,
  onChange,
  ariaLabel,
  placeholder = "선택",
  disabled = false,
  side = "bottom",
  align = "start",
  sideOffset = 7,
  className,
  contentClassName,
}: CustomSelectProps<TValue>) {
  const selectedOption = options.find((option) => option.value === value);
  const hasValue = Boolean(selectedOption);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <button
          type="button"
          aria-label={ariaLabel}
          disabled={disabled}
          className={cn(
            "group flex h-11 w-full cursor-pointer items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3.5 text-left text-sm shadow-sm shadow-slate-200/40 outline-none transition",
            "hover:border-slate-300 hover:shadow-md hover:shadow-slate-200/50",
            "focus-visible:border-emerald-400 focus-visible:ring-2 focus-visible:ring-emerald-100",
            "data-[state=open]:border-emerald-400 data-[state=open]:ring-2 data-[state=open]:ring-emerald-100",
            "disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 disabled:shadow-none",
            className,
          )}
        >
          <span className="flex min-w-0 flex-1 items-center gap-2.5">
            <OptionMarker option={selectedOption} muted={!hasValue} />
            <span
              className={cn(
                "min-w-0 truncate font-semibold",
                hasValue ? "text-slate-900" : "text-slate-400",
              )}
            >
              {selectedOption?.label ?? placeholder}
            </span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition group-data-[state=open]:rotate-180 group-data-[state=open]:text-emerald-500" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={align}
        side={side}
        sideOffset={sideOffset}
        collisionPadding={12}
        className={cn(
          "z-[130] max-h-[min(18rem,var(--radix-dropdown-menu-content-available-height))] w-[var(--radix-dropdown-menu-trigger-width)] min-w-56 rounded-xl border-slate-200 bg-white p-1.5 text-slate-900 shadow-2xl shadow-slate-200/80",
          contentClassName,
        )}
      >
        {options.map((option) => {
          const selected = option.value === value;

          return (
            <DropdownMenuItem
              key={String(option.value)}
              disabled={option.disabled}
              onSelect={() => onChange(option.value)}
              className={cn(
                "flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm outline-none transition hover:bg-emerald-50/70 focus:bg-emerald-50/70 focus:text-slate-950",
                selected && "bg-emerald-50 text-emerald-700",
              )}
            >
              <OptionMarker option={option} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">
                  {option.label}
                </span>
                {option.description ? (
                  <span className="mt-0.5 block truncate text-xs font-medium text-slate-500">
                    {option.description}
                  </span>
                ) : null}
              </span>
              <span className="flex h-5 w-5 shrink-0 items-center justify-center text-emerald-600">
                {selected ? <Check className="h-4 w-4" /> : null}
              </span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
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
