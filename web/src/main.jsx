import React from "react";
import { createRoot } from "react-dom/client";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import App from "./App.jsx";
import "./styles.css";
import { initErrorTracking } from "./errorTracking.js";

initErrorTracking();

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <>
      <App />
      <Analytics />
      <SpeedInsights />
    </>
  </React.StrictMode>
);
