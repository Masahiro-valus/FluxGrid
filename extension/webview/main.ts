import "./style.css";
import { createConnectionPanelApp } from "./connectionPanel";

const vscode = acquireVsCodeApi();
const root = document.getElementById("root");

if (!root) {
  throw new Error("Webview root element not found");
}

root.innerHTML = `
  <main class="connection-panel">
    <section class="connection-list-section">
      <h2>Connections</h2>
      <ul id="connection-list" aria-label="Saved connections"></ul>
    </section>
    <section class="connection-detail-section">
      <form id="connection-form">
        <input type="hidden" id="connection-id" />
        <fieldset>
          <label for="name">Name</label>
          <input id="name" name="name" required />
        </fieldset>
        <fieldset>
          <label for="driver">Driver</label>
          <select id="driver" name="driver">
            <option value="postgres">PostgreSQL</option>
            <option value="mysql">MySQL</option>
            <option value="sqlite">SQLite</option>
          </select>
        </fieldset>
        <fieldset>
          <label for="host">Host</label>
          <input id="host" name="host" required />
        </fieldset>
        <fieldset>
          <label for="port">Port</label>
          <input id="port" name="port" type="number" required />
        </fieldset>
        <fieldset>
          <label for="database">Database</label>
          <input id="database" name="database" required />
        </fieldset>
        <fieldset>
          <label for="username">Username</label>
          <input id="username" name="username" />
        </fieldset>
        <fieldset>
          <label for="password">Password</label>
          <input id="password" name="password" type="password" />
        </fieldset>
        <div class="form-actions">
          <button id="save-button" type="submit">Save</button>
          <button id="delete-button" type="button">Delete</button>
          <button id="new-connection-button" type="button">New</button>
        </div>
      </form>
      <div id="connection-status" role="status" aria-live="polite"></div>
    </section>
  </main>
`;

const app = createConnectionPanelApp(vscode, root.querySelector("main") as HTMLElement);

window.addEventListener("message", (event) => {
  app.handleMessage(event.data);
});

vscode.postMessage({ type: "connection.list" });