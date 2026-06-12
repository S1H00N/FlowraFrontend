import { defineConfig, loadEnv, type PluginOption } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

function firebaseConfigPlugin(env: Record<string, string>): PluginOption {
  const firebaseConfig = {
    apiKey: env.VITE_FIREBASE_API_KEY ?? "",
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN ?? "",
    projectId: env.VITE_FIREBASE_PROJECT_ID ?? "",
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET ?? "",
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? "",
    appId: env.VITE_FIREBASE_APP_ID ?? "",
    measurementId: env.VITE_FIREBASE_MEASUREMENT_ID ?? "",
  };

  return {
    name: "firebase-service-worker-config",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "firebase-config.json",
        source: JSON.stringify(firebaseConfig),
      });
    },
  };
}

export default defineConfig(async ({ mode }) => {
  const root = path.resolve(import.meta.dirname);
  const env = loadEnv(mode, root, "");
  const rawPort = process.env.PORT;
  const port = rawPort ? Number(rawPort) : 3000;

  if (Number.isNaN(port) || port <= 0) {
    throw new Error(`Invalid PORT value: "${rawPort}"`);
  }

  const basePath = process.env.BASE_PATH ?? "/";

  const plugins: PluginOption[] = [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    firebaseConfigPlugin(env),
  ];

  if (process.env.NODE_ENV !== "production" && process.env.REPL_ID !== undefined) {
    const { cartographer } = await import("@replit/vite-plugin-cartographer");
    const { devBanner } = await import("@replit/vite-plugin-dev-banner");

    plugins.push(
      cartographer({
        root: path.resolve(import.meta.dirname, ".."),
      }),
    );

    plugins.push(devBanner());
  }

  return {
    base: basePath,
    plugins,
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "src"),
        "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
      },
      dedupe: ["react", "react-dom"],
    },
    root,
    build: {
      outDir: path.resolve(import.meta.dirname, "dist/public"),
      emptyOutDir: true,
    },
    server: {
      port,
      strictPort: rawPort !== undefined,
      host: "0.0.0.0",
      allowedHosts: true,
      fs: {
        strict: true,
      },
    },
    preview: {
      port,
      host: "0.0.0.0",
      allowedHosts: true,
    },
  };
});
