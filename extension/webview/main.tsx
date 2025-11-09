import React from "react";
import ReactDOM from "react-dom/client";
import { provideVSCodeDesignSystem, allComponents } from "@vscode/webview-ui-toolkit";
import "./global.css";
import { I18nProvider } from "../src/webview/i18n";
import { QueryEditor } from "../src/webview/pages/QueryEditor";
import { createVscodeBridge } from "../src/webview/utils/vscode";

provideVSCodeDesignSystem().register(allComponents);

const vscodeApi = createVscodeBridge();
const locale = typeof navigator !== "undefined" ? navigator.language : "en";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Unable to locate root element.");
}

const root = ReactDOM.createRoot(rootElement);

root.render(
  <React.StrictMode>
    <I18nProvider locale={locale}>
      <QueryEditor vscodeApi={vscodeApi} />
    </I18nProvider>
  </React.StrictMode>
);

vscodeApi.postMessage({ type: "query.ready" });

