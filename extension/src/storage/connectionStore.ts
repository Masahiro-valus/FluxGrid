import { randomUUID } from "crypto";

export type SupportedDriver = "postgres" | "mysql" | "sqlite";

export interface ConnectionInput {
  id?: string;
  name: string;
  driver: SupportedDriver;
  host: string;
  port: number;
  database: string;
  username?: string;
  password?: string;
  options?: Record<string, unknown>;
}

export interface StoredConnection {
  id: string;
  name: string;
  driver: SupportedDriver;
  host: string;
  port: number;
  database: string;
  username?: string;
  options?: Record<string, unknown>;
  secretId: string;
  createdAt: string;
  updatedAt: string;
}

export interface HydratedConnection extends StoredConnection {
  password?: string;
}

export interface SecretStorage {
  get(key: string): Thenable<string | undefined>;
  store(key: string, value: string): Thenable<void>;
  delete(key: string): Thenable<void>;
}

export interface StateStorage {
  get<T>(key: string, defaultValue?: T): T | undefined;
  update(key: string, value: unknown): Thenable<void>;
}

export interface ConnectionStoreOptions {
  secretStorage: SecretStorage;
  stateStorage: StateStorage;
  connectionKey?: string;
  now?: () => Date;
}

interface PersistedState {
  connections: StoredConnection[];
}

const DEFAULT_KEY = "fluxgrid.connections";

export class ConnectionStore {
  private readonly key: string;
  private readonly nowProvider: () => Date;

  constructor(private readonly options: ConnectionStoreOptions) {
    this.key = options.connectionKey ?? DEFAULT_KEY;
    this.nowProvider = options.now ?? (() => new Date());
  }

  async list(): Promise<StoredConnection[]> {
    const state = this.loadState();
    return state.connections;
  }

  async get(id: string, opts?: { includeSecrets?: boolean }): Promise<HydratedConnection | undefined> {
    const found = this.loadState().connections.find((conn) => conn.id === id);
    if (!found) {
      return undefined;
    }

    if (!opts?.includeSecrets) {
      return { ...found };
    }

    const password = await this.options.secretStorage.get(found.secretId);
    return {
      ...found,
      password: password ?? undefined
    };
  }

  async save(input: ConnectionInput): Promise<StoredConnection> {
    const state = this.loadState();
    const existingIndex = input.id
      ? state.connections.findIndex((conn) => conn.id === input.id)
      : -1;

    const nowIso = this.nowProvider().toISOString();
    let record: StoredConnection;

    if (existingIndex >= 0) {
      const current = state.connections[existingIndex];
      record = {
        ...current,
        name: input.name,
        driver: input.driver,
        host: input.host,
        port: input.port,
        database: input.database,
        username: input.username,
        options: input.options,
        updatedAt: nowIso
      };
      if (input.password !== undefined) {
        await this.storeSecret(current.secretId, input.password);
      }
      state.connections[existingIndex] = record;
    } else {
      const id = input.id ?? randomUUID();
      const secretId = `fluxgrid:secret:${id}`;
      record = {
        id,
        secretId,
        name: input.name,
        driver: input.driver,
        host: input.host,
        port: input.port,
        database: input.database,
        username: input.username,
        options: input.options,
        createdAt: nowIso,
        updatedAt: nowIso
      };
      if (input.password) {
        await this.storeSecret(secretId, input.password);
      }
      state.connections.push(record);
    }

    await this.persist(state);
    return record;
  }

  async delete(id: string): Promise<void> {
    const state = this.loadState();
    const index = state.connections.findIndex((conn) => conn.id === id);
    if (index === -1) {
      return;
    }
    const [removed] = state.connections.splice(index, 1);
    await this.options.secretStorage.delete(removed.secretId);
    await this.persist(state);
  }

  private loadState(): PersistedState {
    const stored = this.options.stateStorage.get<PersistedState>(this.key, { connections: [] });
    if (!stored) {
      return { connections: [] };
    }
    return {
      connections: [...stored.connections]
    };
  }

  private async persist(state: PersistedState): Promise<void> {
    await this.options.stateStorage.update(this.key, state);
  }

  private async storeSecret(secretId: string, value: string): Promise<void> {
    if (value === "") {
      await this.options.secretStorage.delete(secretId);
      return;
    }

    await this.options.secretStorage.store(secretId, value);
  }
}

