import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./style.css";

const DesignSystem = lazy(() => import("./DesignSystem.tsx"));
const isDesignPreview = new URLSearchParams(location.search).has("design");
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
