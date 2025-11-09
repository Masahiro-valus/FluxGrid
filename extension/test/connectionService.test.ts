import { beforeEach, describe, expect, it } from "vitest";
import {
  ConnectionService,
  type ConnectionsChangeListener
} from "../src/services/connectionService";
import type {
  ConnectionInput,
  HydratedConnection,
  StoredConnection
} from "../src/storage/connectionStore";

class FakeConnectionStore {
  private readonly items = new Map<string, StoredConnection>();

  constructor(private readonly now: () => Date = () => new Date("2024-01-01T00:00:00Z")) {}

  async list(): Promise<StoredConnection[]> {
    return Array.from(this.items.values());
  }

  async get(
    id: string,
    opts?: { includeSecrets?: boolean }
  ): Promise<HydratedConnection | undefined> {
    const item = this.items.get(id);
    if (!item) {
      return undefined;
    }
    return {
      ...item,
      password: opts?.includeSecrets ? `secret-${item.id}` : undefined
    };
  }

  async save(input: ConnectionInput): Promise<StoredConnection> {
    const existing = input.id ? this.items.get(input.id) : undefined;
    const nowIso = this.now().toISOString();
    const record: StoredConnection = {
      id: existing?.id ?? input.id ?? `id-${this.items.size + 1}`,
      secretId: existing?.secretId ?? `secret-${this.items.size + 1}`,
      name: input.name,
      driver: input.driver,
      host: input.host,
      port: input.port,
      database: input.database,
      username: input.username,
      options: input.options,
      createdAt: existing?.createdAt ?? nowIso,
      updatedAt: nowIso
    };

    this.items.set(record.id, record);
    return record;
  }

  async delete(id: string): Promise<void> {
    this.items.delete(id);
  }
}

describe("ConnectionService", () => {
  let store: FakeConnectionStore;
  let service: ConnectionService;
  let events: StoredConnection[][];
  let unsubscribe: ReturnType<ConnectionService["onDidChangeConnections"]>;

  beforeEach(() => {
    store = new FakeConnectionStore();
    service = new ConnectionService(store as any);
    events = [];
    unsubscribe = service.onDidChangeConnections((connections) => {
      events.push(connections);
    });
  });

  afterEach(() => {
    unsubscribe.dispose();
  });

  it("lists connections via the underlying store", async () => {
    expect(await service.listConnections()).toEqual([]);
    await service.createConnection({
      name: "Local",
      driver: "postgres",
      host: "localhost",
      port: 5432,
      database: "postgres",
      username: "postgres",
      password: "secret"
    });

    const list = await service.listConnections();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("Local");
  });

  it("creates connections and emits change events", async () => {
    const created = await service.createConnection({
      name: "Analytics",
      driver: "postgres",
      host: "db",
      port: 5432,
      database: "analytics",
      username: "analyst",
      password: "pw"
    });

    expect(created.id).toBeTruthy();
    expect(events).toHaveLength(1);
    expect(events[0][0].name).toBe("Analytics");
  });

  it("updates existing connections and emits change events", async () => {
    const created = await service.createConnection({
      id: "conn-1",
      name: "App",
      driver: "postgres",
      host: "db",
      port: 5432,
      database: "app",
      username: "app",
      password: "pw"
    });
    events = [];

    const updated = await service.updateConnection({
      ...created,
      name: "App Updated"
    });

    expect(updated.name).toBe("App Updated");
    expect(events).toHaveLength(1);
    expect(events[0][0].name).toBe("App Updated");
  });

  it("deletes connections and emits change events", async () => {
    const created = await service.createConnection({
      name: "ToDelete",
      driver: "postgres",
      host: "db",
      port: 5432,
      database: "postgres",
      username: "postgres",
      password: "pw"
    });
    events = [];

    await service.deleteConnection(created.id);

    expect(await service.listConnections()).toEqual([]);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual([]);
  });

  it("fetches single connection including secrets when requested", async () => {
    const created = await service.createConnection({
      id: "conn-secret",
      name: "Secret",
      driver: "postgres",
      host: "db",
      port: 5432,
      database: "postgres",
      username: "postgres",
      password: "pw"
    });

    const hydrated = await service.getConnection(created.id, { includeSecrets: true });
    expect(hydrated?.password).toBe("secret-conn-secret");
  });
});

