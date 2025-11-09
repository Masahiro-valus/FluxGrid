import type {
  ConnectionInput,
  ConnectionStore,
  HydratedConnection,
  StoredConnection
} from "../storage/connectionStore";

export type ConnectionsChangeListener = (connections: StoredConnection[]) => void;

export interface Disposable {
  dispose(): void;
}

type StoreLike = Pick<ConnectionStore, "list" | "save" | "delete" | "get">;

export class ConnectionService {
  private readonly listeners = new Set<ConnectionsChangeListener>();

  constructor(private readonly store: StoreLike) {}

  onDidChangeConnections(listener: ConnectionsChangeListener): Disposable {
    this.listeners.add(listener);
    return {
      dispose: () => {
        this.listeners.delete(listener);
      }
    };
  }

  async listConnections(): Promise<StoredConnection[]> {
    return this.store.list();
  }

  async getConnection(
    id: string,
    opts?: { includeSecrets?: boolean }
  ): Promise<HydratedConnection | undefined> {
    return this.store.get(id, opts);
  }

  async createConnection(input: ConnectionInput): Promise<StoredConnection> {
    const record = await this.store.save({
      ...input,
      id: input.id
    });
    await this.emitChange();
    return record;
  }

  async updateConnection(input: ConnectionInput & { id: string }): Promise<StoredConnection> {
    if (!input.id) {
      throw new Error("Connection id is required to update.");
    }

    const record = await this.store.save({
      id: input.id,
      name: input.name,
      driver: input.driver,
      host: input.host,
      port: input.port,
      database: input.database,
      username: input.username,
      password: input.password,
      options: input.options
    });
    await this.emitChange();
    return record;
  }

  async deleteConnection(id: string): Promise<void> {
    await this.store.delete(id);
    await this.emitChange();
  }

  private async emitChange(): Promise<void> {
    const snapshot = await this.store.list();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}
