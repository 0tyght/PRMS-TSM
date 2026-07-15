import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import RootErrorBoundary from "./components/layout/RootErrorBoundary.jsx";
import "./styles.css";

const rootElement = document.getElementById("root");
const fatalElement = document.getElementById("fatal-root");

if (window.__prmsBootTimer) {
  window.clearTimeout(window.__prmsBootTimer);
}

function revealFatalScreen(error) {
  console.error("PRMS fatal browser error:", error);

  window.setTimeout(() => {
    if (
      rootElement &&
      rootElement.childElementCount === 0 &&
      fatalElement
    ) {
      fatalElement.hidden = false;
    }
  }, 0);
}

window.addEventListener("error", (event) => {
  revealFatalScreen(
    event.error ||
      new Error(event.message || "Unknown browser error"),
  );
});

window.addEventListener("unhandledrejection", (event) => {
  revealFatalScreen(event.reason);
});

if (!rootElement) {
  throw new Error("ไม่พบ element #root สำหรับเปิดระบบ");
}

const root = createRoot(rootElement, {
  onRecoverableError(error, errorInfo) {
    console.error(
      "PRMS recoverable React error:",
      error,
      errorInfo,
    );
  },
});

root.render(
  <React.StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </React.StrictMode>,
);