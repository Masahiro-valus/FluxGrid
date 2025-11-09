export interface ConnectionSummary {
  id: string;
  name: string;
  driver: string;
}

export interface ConnectionDetail extends ConnectionSummary {
  host: string;
  port: number;
  database: string;
  username?: string;
  password?: string;
}

export interface ConnectionPanelApp {
  updateConnections(connections: ConnectionSummary[]): void;
  handleMessage(message: unknown): void;
}

export interface VsCodeApi {
  postMessage(message: unknown): void;
}

function getElement<T extends HTMLElement>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing element matching selector ${selector}`);
  }
  return element;
}

export function createConnectionPanelApp(vscodeApi: VsCodeApi, root: HTMLElement): ConnectionPanelApp {
  const listEl = getElement<HTMLUListElement>(root, "#connection-list");
  const statusEl = getElement<HTMLDivElement>(root, "#connection-status");
  const formEl = getElement<HTMLFormElement>(root, "#connection-form");
  const idInput = getElement<HTMLInputElement>(formEl, "#connection-id");
  const nameInput = getElement<HTMLInputElement>(formEl, "#name");
  const driverSelect = getElement<HTMLSelectElement>(formEl, "#driver");
  const hostInput = getElement<HTMLInputElement>(formEl, "#host");
  const portInput = getElement<HTMLInputElement>(formEl, "#port");
  const databaseInput = getElement<HTMLInputElement>(formEl, "#database");
  const usernameInput = getElement<HTMLInputElement>(formEl, "#username");
  const passwordInput = getElement<HTMLInputElement>(formEl, "#password");
  const deleteButton = getElement<HTMLButtonElement>(formEl, "#delete-button");
  const newButton = getElement<HTMLButtonElement>(formEl, "#new-connection-button");

  let connections: ConnectionSummary[] = [];
  let selectedId: string | undefined;

  const setStatus = (message: string, tone: "info" | "error" = "info") => {
    statusEl.textContent = message;
    statusEl.dataset.tone = tone;
  };

  const renderList = () => {
    listEl.innerHTML = "";
    connections.forEach((connection) => {
      const item = document.createElement("li");
      item.textContent = connection.name;
      item.dataset.id = connection.id;
      item.tabIndex = 0;
      if (connection.id === selectedId) {
        item.classList.add("selected");
      }
      item.addEventListener("click", () => {
        selectConnection(connection.id);
        vscodeApi.postMessage({
          type: "connection.select",
          payload: { id: connection.id }
        });
      });
      item.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          item.click();
        }
      });
      listEl.append(item);
    });
  };

  const clearForm = () => {
    idInput.value = "";
    nameInput.value = "";
    driverSelect.value = "postgres";
    hostInput.value = "";
    portInput.value = "";
    databaseInput.value = "";
    usernameInput.value = "";
    passwordInput.value = "";
  };

  const selectConnection = (id: string | undefined) => {
    selectedId = id;
    renderList();
  };

  const populateForm = (detail: ConnectionDetail) => {
    idInput.value = detail.id;
    nameInput.value = detail.name;
    driverSelect.value = detail.driver;
    hostInput.value = detail.host;
    portInput.value = String(detail.port);
    databaseInput.value = detail.database;
    usernameInput.value = detail.username ?? "";
    passwordInput.value = detail.password ?? "";
  };

  formEl.addEventListener("submit", (event) => {
    event.preventDefault();
    const port = Number(portInput.value);
    const payload = {
      id: idInput.value || undefined,
      name: nameInput.value.trim(),
      driver: driverSelect.value,
      host: hostInput.value.trim(),
      port,
      database: databaseInput.value.trim(),
      username: usernameInput.value.trim() || undefined,
      password: passwordInput.value
    };

    if (!payload.name || !payload.host || !payload.database || !Number.isInteger(port) || port <= 0) {
      setStatus("Please provide valid connection details.", "error");
      return;
    }

    if (payload.id) {
      vscodeApi.postMessage({ type: "connection.update", payload });
      setStatus(`Updating ${payload.name}...`);
    } else {
      vscodeApi.postMessage({ type: "connection.create", payload });
      setStatus(`Creating ${payload.name}...`);
    }
  });

  deleteButton.addEventListener("click", () => {
    if (!idInput.value) {
      setStatus("Select a connection to delete.", "error");
      return;
    }

    vscodeApi.postMessage({
      type: "connection.delete",
      payload: { id: idInput.value }
    });
    setStatus("Deleting connection...");
  });

  newButton.addEventListener("click", () => {
    selectConnection(undefined);
    clearForm();
    setStatus("Ready to create a new connection.");
  });

  return {
    updateConnections(nextConnections: ConnectionSummary[]) {
      connections = nextConnections;
      if (selectedId && !connections.some((conn) => conn.id === selectedId)) {
        selectConnection(undefined);
        clearForm();
      }
      renderList();
      setStatus(`${connections.length} connection(s) available.`);
    },
    handleMessage(message: unknown) {
      if (!message || typeof message !== "object") {
        return;
      }

      const { type, payload, error, tone } = message as {
        type?: string;
        payload?: unknown;
        error?: string;
        tone?: "info" | "error";
      };

      switch (type) {
        case "connection.list.result":
          if (Array.isArray(payload)) {
            this.updateConnections(payload as ConnectionSummary[]);
          }
          if (error) {
            setStatus(error, "error");
          }
          break;
        case "connection.select.result":
          if (payload && typeof payload === "object") {
            const detail = payload as ConnectionDetail;
            selectConnection(detail.id);
            populateForm(detail);
            setStatus(`Loaded ${detail.name}.`);
          }
          break;
        case "connection.status":
          if (typeof payload === "string") {
            setStatus(payload, tone ?? "info");
          }
          break;
        case "connection.error":
          if (error) {
            setStatus(error, "error");
          }
          break;
        default:
          break;
      }
    }
  };
}
