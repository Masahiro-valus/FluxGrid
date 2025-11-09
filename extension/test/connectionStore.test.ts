import { beforeEach, describe, expect, it } from "vitest";
import { ConnectionStore } from "../src/storage/connectionStore";

class FakeSecretStorage {
  private readonly data = new Map<string, string>();

  async get(key: string): Promise<string | undefined> {
    return this.data.get(key);
  }

  async store(key: string, value: string): Promise<void> {
    this.data.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.data.delete(key);
  }
}

class FakeMemento {
  private readonly state = new Map<string, unknown>();

  get<T>(key: string, defaultValue?: T): T | undefined {
    const value = this.state.get(key);
    if (value === undefined) {
      return defaultValue;
    }
    return value as T;
  }

  async update(key: string, value: unknown): Promise<void> {
    if (value === undefined) {
      this.state.delete(key);
      return;
    }
    this.state.set(key, value);
  }
}

describe("ConnectionStore", () => {
  const CONNECTION_KEY = "fluxgrid.connections";
  let secretStorage: FakeSecretStorage;
  let memento: FakeMemento;
  let store: ConnectionStore;

  beforeEach(() => {
    secretStorage = new FakeSecretStorage();
    memento = new FakeMemento();
    store = new ConnectionStore({
      secretStorage: secretStorage as any,
      stateStorage: memento as any,
      connectionKey: CONNECTION_KEY
    });
  });

  it("saves connection metadata and stores password in secret storage", async () => {
    const profile = await store.save({
      name: "Local Postgres",
      driver: "postgres",
      host: "localhost",
      port: 5432,
      database: "postgres",
      username: "postgres",
      password: "secret"
    });

    const all = await store.list();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({
      id: profile.id,
      name: "Local Postgres",
      driver: "postgres",
      host: "localhost",
      port: 5432,
      database: "postgres",
      username: "postgres"
    });
    expect(all[0]).not.toHaveProperty("password");

    const secret = await secretStorage.get(profile.secretId);
    expect(secret).toBe("secret");
  });

  it("hydrates password when requested explicitly", async () => {
    const saved = await store.save({
      name: "Local PG",
      driver: "postgres",
      host: "db",
      port: 5432,
      database: "postgres",
      username: "postgres",
      password: "pass123"
    });

    const profile = await store.get(saved.id, { includeSecrets: true });
    expect(profile?.password).toBe("pass123");
  });

  it("keeps existing secret when password is omitted on update", async () => {
    const saved = await store.save({
      name: "Local PG",
      driver: "postgres",
      host: "db",
      port: 5432,
      database: "postgres",
      username: "postgres",
      password: "initial"
    });

    await store.save({
      id: saved.id,
      name: "Local PG Updated",
      driver: saved.driver,
      host: saved.host,
      port: saved.port,
      database: saved.database,
      username: saved.username
    });

    const hydrated = await store.get(saved.id, { includeSecrets: true });
    expect(hydrated?.password).toBe("initial");
    expect(hydrated?.name).toBe("Local PG Updated");
  });

  it("removes secret when password is an empty string", async () => {
    const saved = await store.save({
      name: "Local PG",
      driver: "postgres",
      host: "db",
      port: 5432,
      database: "postgres",
      username: "postgres",
      password: "initial"
    });

    await store.save({
      id: saved.id,
      name: saved.name,
      driver: saved.driver,
      host: saved.host,
      port: saved.port,
      database: saved.database,
      username: saved.username,
      password: ""
    });

    const secret = await secretStorage.get(saved.secretId);
    expect(secret).toBeUndefined();
  });

  it("deletes connection and removes secret", async () => {
    const profile = await store.save({
      name: "Local PG",
      driver: "postgres",
      host: "db",
      port: 5432,
      database: "postgres",
      username: "postgres",
      password: "pass123"
    });

    await store.delete(profile.id);

    const all = await store.list();
    expect(all).toHaveLength(0);
    expect(await secretStorage.get(profile.secretId)).toBeUndefined();
  });
});

