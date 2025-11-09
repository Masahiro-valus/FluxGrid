import "./style.css";

const vscode = acquireVsCodeApi();

const root = document.getElementById("root");

if (root) {
  root.innerHTML = `
    <main data-testid="fluxgrid-root">
      <section class="header">
        <h1>FluxGrid</h1>
        <p>最初の接続を作成し、SQLを実行してみましょう。</p>
      </section>
      <section class="status">
        <label>Core Engine</label>
        <span id="core-status">初期化中...</span>
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

