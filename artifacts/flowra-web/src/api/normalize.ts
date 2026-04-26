export function toOptionalNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return undefined;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function toNullableNumber(value: string | number | null | undefined) {
  if (value === null || value === "") return null;
  return toOptionalNumber(value);
}

export function toOptionalString(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return undefined;
  return String(value);
}

export function toNullableString(value: string | number | null | undefined) {
  if (value === null || value === "") return null;
  return toOptionalString(value);
}

export function toCommaParam(
  value:
    | string
    | number
    | boolean
    | Array<string | number | boolean>
    | null
    | undefined,
) {
  if (value === null || value === undefined || value === "") return undefined;
  if (Array.isArray(value)) {
    const items = value
      .filter((item) => item !== "")
      .map((item) => String(item));
    return items.length > 0 ? items.join(",") : undefined;
  }
  return String(value);
}

export function compactParams<T extends Record<string, unknown>>(params: T) {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== ""),
  ) as Partial<T>;
}
