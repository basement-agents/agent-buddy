import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import geistLatinUrl from "@fontsource-variable/geist/files/geist-latin-wght-normal.woff2?url";
import "./index.css";
import App from "./app";

const preload = document.createElement("link");
preload.rel = "preload";
preload.as = "font";
preload.type = "font/woff2";
preload.href = geistLatinUrl;
preload.crossOrigin = "anonymous";
document.head.appendChild(preload);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
