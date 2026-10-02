interface GoogleCredentialResponse {
  credential: string;
  state?: string;
}

interface GoogleIdentityApi {
  initialize: (options: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
    auto_select: boolean;
    ux_mode: "popup";
  }) => void;
  renderButton: (element: HTMLElement, options: {
    type: "standard";
    theme: "outline";
    size: "large";
    text: "continue_with";
    width: string;
    locale: string;
    state: string;
  }) => void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleIdentityApi } };
  }
}

export const googleOAuthClientId = import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID?.trim() ?? "";

let scriptPromise: Promise<GoogleIdentityApi> | undefined;
let initializedClientId: string | undefined;
const credentialHandlers = new Map<string, (idToken: string) => void>();

function loadGoogleIdentity(): Promise<GoogleIdentityApi> {
  if (window.google?.accounts?.id) return Promise.resolve(window.google.accounts.id);
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client?hl=ko";
    script.async = true;
    script.defer = true;
    const timer = window.setTimeout(() => fail(), 15_000);
    function fail() {
      window.clearTimeout(timer);
      script.remove();
      scriptPromise = undefined;
      reject(new Error("Google 로그인을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."));
    }
    script.onerror = fail;
    script.onload = () => {
      window.clearTimeout(timer);
      const identity = window.google?.accounts?.id;
      if (!identity) return fail();
      resolve(identity);
    };
    document.head.append(script);
  });
  return scriptPromise;
}

export async function renderGoogleIdButton(
  element: HTMLElement,
  state: string,
  onCredential: (idToken: string) => void,
): Promise<() => void> {
  const identity = await loadGoogleIdentity();
  if (initializedClientId !== googleOAuthClientId) {
    identity.initialize({
      client_id: googleOAuthClientId,
      callback: (response) => {
        // GIS returns an ID token in credential; never request an access/Firebase token.
        const handler = response.state
          ? credentialHandlers.get(response.state)
          : credentialHandlers.size === 1 ? credentialHandlers.values().next().value : undefined;
        if (response.credential && handler) handler(response.credential);
      },
      auto_select: false,
      ux_mode: "popup",
    });
    initializedClientId = googleOAuthClientId;
  }
  credentialHandlers.set(state, onCredential);
  identity.renderButton(element, {
    type: "standard",
    theme: "outline",
    size: "large",
    text: "continue_with",
    width: String(Math.min(400, element.clientWidth || 280)),
    locale: "ko",
    state,
  });
  return () => credentialHandlers.delete(state);
}
