import "./style.css";

const vscode = acquireVsCodeApi();

const root = document.getElementById("root");

if (root) {
  root.innerHTML = `
    <main data-testid="fluxgrid-root">
      <section class="header">
        <h1>FluxGrid</h1>
        <p>Create your first connection and run a query.</p>
      </section>
      <section class="status">
        <label>Core Engine</label>
        <span id="core-status">Initializing...</span>
      </section>
    </main>
  `;
}

window.addEventListener("message", (event) => {
  const { type, payload } = event.data;
  if (type === "core-status") {
    const status = document.getElementById("core-status");
    if (status) {
      status.textContent = payload;
    }
  }
});

vscode.postMessage({ type: "ready" });

