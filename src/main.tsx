import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { initializeTheme } from "./theme.ts";
import "./style.css";

const DesignSystem = lazy(() => import("./DesignSystem.tsx"));
const params = new URLSearchParams(location.search);
const isDesignPreview = params.has("design");
const preview = params.get("theme");
const stopThemeSync = initializeTheme(
  (import.meta.env.DEV || isDesignPreview) &&
    (preview === "light" || preview === "dark")
    ? preview
    : undefined,
);
if (import.meta.hot) import.meta.hot.dispose(stopThemeSync);
if (isDesignPreview) document.title = "Своя кухня — дизайн-система";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {isDesignPreview ? (
      <Suspense
        fallback={
          <div className="bootstrap">
            <div className="skeleton big" />
          </div>
        }
      >
        <DesignSystem />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
);
