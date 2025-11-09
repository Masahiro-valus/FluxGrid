import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConnectionInput } from "../src/storage/connectionStore";
import { registerConnectionCommands } from "../src/commands/connectionCommands";

const { commandRegistry, registerCommandMock } = vi.hoisted(() => {
  const registry: Record<string, (...args: any[]) => unknown> = {};
  const register = vi.fn((name: string, handler: (...args: unknown[]) => unknown) => {
    registry[name] = handler;
    return { dispose: vi.fn() };
  });
  return { commandRegistry: registry, registerCommandMock: register };
});

vi.mock("vscode", () => ({
  commands: {
    registerCommand: registerCommandMock
  }
}));

class FakeConnectionService {
  listConnections = vi.fn(async () => ["list"]);
  createConnection = vi.fn(async (input: ConnectionInput) => ({ id: "new", ...input }));
  updateConnection = vi.fn(async (input: ConnectionInput & { id: string }) => ({
    id: input.id,
    ...input
  }));
  deleteConnection = vi.fn(async () => undefined);
  getConnection = vi.fn(async () => ({ id: "x", name: "Conn" }));
}

describe("connection command registration", () => {
  let context: { subscriptions: { dispose(): void }[] };
  let service: FakeConnectionService;

  beforeEach(() => {
    context = { subscriptions: [] };
    service = new FakeConnectionService();
    registerCommandMock.mockClear();
    for (const key of Object.keys(commandRegistry)) {
      delete commandRegistry[key];
    }
    registerConnectionCommands(context as any, service as any);
  });

  it("registers all expected commands and tracks disposables", () => {
    expect(registerCommandMock).toHaveBeenCalledTimes(5);
    expect(context.subscriptions).toHaveLength(5);
    expect(Object.keys(commandRegistry)).toEqual([
      "fluxgrid.connection.list",
      "fluxgrid.connection.add",
      "fluxgrid.connection.update",
      "fluxgrid.connection.delete",
      "fluxgrid.connection.get"
    ]);
  });

  it("delegates list command to service", async () => {
    const result = await commandRegistry["fluxgrid.connection.list"]();
    expect(service.listConnections).toHaveBeenCalledTimes(1);
    expect(result).toEqual(["list"]);
  });

  it("delegates add command to service", async () => {
    const input: ConnectionInput = {
      name: "Add",
      driver: "postgres",
      host: "localhost",
      port: 5432,
      database: "postgres",
      username: "postgres",
      password: "pw"
    };
    const result = await commandRegistry["fluxgrid.connection.add"](input);
    expect(service.createConnection).toHaveBeenCalledWith(input);
    expect(result?.id).toBe("new");
  });

  it("delegates update command to service", async () => {
    await commandRegistry["fluxgrid.connection.update"]({
      id: "conn-1",
      name: "Updated",
      driver: "postgres",
      host: "db",
      port: 5432,
      database: "postgres"
    });
    expect(service.updateConnection).toHaveBeenCalledWith({
      id: "conn-1",
      name: "Updated",
      driver: "postgres",
      host: "db",
      port: 5432,
      database: "postgres"
    });
  });

  it("delegates delete and get commands to service", async () => {
    await commandRegistry["fluxgrid.connection.delete"]("conn-1");
    expect(service.deleteConnection).toHaveBeenCalledWith("conn-1");

    await commandRegistry["fluxgrid.connection.get"]("conn-1", { includeSecrets: true });
    expect(service.getConnection).toHaveBeenCalledWith("conn-1", { includeSecrets: true });
  });
});

