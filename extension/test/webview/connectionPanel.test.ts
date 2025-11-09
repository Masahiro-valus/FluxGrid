import { describe, expect, it, beforeEach, vi } from "vitest";
import { createConnectionPanelApp, type ConnectionSummary } from "../../webview/connectionPanel";

const createVsCodeMock = () => ({
  postMessage: vi.fn()
});

describe("connection panel webview", () => {
  let root: HTMLElement;
  let api: ReturnType<typeof createVsCodeMock>;

  beforeEach(() => {
    document.body.innerHTML = `<main>
      <form id="connection-form">
        <input type="hidden" id="connection-id" />
        <input name="name" id="name" />
        <select name="driver" id="driver">
          <option value="postgres">Postgres</option>
        </select>
        <input name="host" id="host" />
        <input name="port" id="port" type="number" />
        <input name="database" id="database" />
        <input name="username" id="username" />
        <input name="password" id="password" />
        <button id="delete-button" type="button">Delete</button>
        <button id="save-button" type="submit">Save</button>
        <button id="new-connection-button" type="button">New</button>
      </form>
      <ul id="connection-list"></ul>
      <div id="connection-status"></div>
    </main>`;

    root = document.body.querySelector("main") as HTMLElement;
    api = createVsCodeMock();
  });

  it("renders connections list when state updates", () => {
    const app = createConnectionPanelApp(api, root);
    const items: ConnectionSummary[] = [
      { id: "1", name: "Local Postgres", driver: "postgres" },
      { id: "2", name: "Analytics", driver: "postgres" }
    ];
    app.updateConnections(items);

    const listItems = Array.from(
      root.querySelectorAll<HTMLLIElement>("#connection-list li")
    ).map((li) => li.textContent?.trim());

    expect(listItems).toEqual(["Local Postgres", "Analytics"]);
  });

  it("submits form data via postMessage", () => {
    const app = createConnectionPanelApp(api, root);
    app.updateConnections([]);

    (root.querySelector<HTMLInputElement>("#name")!).value = "New Conn";
    (root.querySelector<HTMLInputElement>("#host")!).value = "localhost";
    (root.querySelector<HTMLInputElement>("#port")!).value = "5432";
    (root.querySelector<HTMLInputElement>("#database")!).value = "postgres";
    (root.querySelector<HTMLInputElement>("#username")!).value = "postgres";
    (root.querySelector<HTMLInputElement>("#password")!).value = "pw";

    root.querySelector<HTMLFormElement>("#connection-form")!.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true })
    );

    expect(api.postMessage).toHaveBeenCalledWith({
      type: "connection.create",
      payload: {
        name: "New Conn",
        driver: "postgres",
        host: "localhost",
        port: 5432,
        database: "postgres",
        username: "postgres",
        password: "pw"
      }
    });
  });

  it("selecting a connection populates the form and posts selection message", () => {
    const app = createConnectionPanelApp(api, root);
    app.updateConnections([{ id: "1", name: "Local", driver: "postgres" }]);

    root.querySelector<HTMLLIElement>("#connection-list li")!.click();

    expect(api.postMessage).toHaveBeenCalledWith({
      type: "connection.select",
      payload: { id: "1" }
    });
  });
});

