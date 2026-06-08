import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { applyUserTheme, readUserSettings } from "@/lib/userSettings";

applyUserTheme(readUserSettings().theme);

createRoot(document.getElementById("root")!).render(<App />);
