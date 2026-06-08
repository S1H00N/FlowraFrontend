const GRAVATAR_BASE_URL = "https://gravatar.com/avatar";
const DEFAULT_GRAVATAR_SIZE = 160;

function normalizeAvatarSize(size: number) {
  if (!Number.isFinite(size)) return DEFAULT_GRAVATAR_SIZE;
  return Math.min(2048, Math.max(1, Math.round(size)));
}

function normalizeGravatarEmail(email: string) {
  return email.trim().toLowerCase();
}

async function sha256Hex(value: string) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;

  const digest = await subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function getGravatarProfileImageUrl(
  email: string | null | undefined,
  size = DEFAULT_GRAVATAR_SIZE,
) {
  const normalizedEmail = normalizeGravatarEmail(email ?? "");
  if (!normalizedEmail) return null;

  const hash = await sha256Hex(normalizedEmail);
  if (!hash) return null;

  const params = new URLSearchParams({
    s: String(normalizeAvatarSize(size)),
    r: "g",
    d: "mp",
  });

  return `${GRAVATAR_BASE_URL}/${hash}?${params.toString()}`;
}
