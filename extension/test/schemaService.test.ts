import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HydratedConnection } from "../src/storage/connectionStore";
import { SchemaService } from "../src/services/schemaService";

vi.mock("vscode", () => import("./__mocks__/vscode"));

describe("SchemaService", () => {
  const createCoreClient = () => ({
    sendRequest: vi.fn(),
    onNotification: vi.fn(() => ({ dispose: vi.fn() })),
    sendNotification: vi.fn(),
    dispose: vi.fn()
  });

  const createConnectionService = () => ({
    getConnection: vi.fn()
  });

  let coreClient: ReturnType<typeof createCoreClient>;
  let connectionService: ReturnType<typeof createConnectionService>;
  let service: SchemaService;

  beforeEach(() => {
    coreClient = createCoreClient();
    connectionService = createConnectionService();
    service = new SchemaService(coreClient as any, connectionService as any);
  });

  it("requests schema list with hydrated connection", async () => {
    const connection = {
      id: "1",
      name: "Local",
      driver: "postgres",
      host: "localhost",
      port: 5432,
      database: "postgres",
      username: "postgres",
      password: "pw",
      options: { ssl: false }
    } as HydratedConnection & { password?: string };

    connectionService.getConnection.mockResolvedValue(connection);
    coreClient.sendRequest.mockResolvedValue({ schemas: [] });

    await service.list({ connectionId: "1" });

    expect(connectionService.getConnection).toHaveBeenCalledWith("1", { includeSecrets: true });
    expect(coreClient.sendRequest).toHaveBeenCalledWith(
      "schema.list",
      expect.objectContaining({
        connection: expect.objectContaining({
          driver: "postgres",
          dsn: expect.stringContaining("postgresql://")
        })
      })
    );
  });

  it("throws when no connection is available", async () => {
    connectionService.getConnection.mockResolvedValue(undefined);

    const originalDsn = process.env.FLUXGRID_DSN;
    delete process.env.FLUXGRID_DSN;

    await expect(service.list({ connectionId: "missing" })).rejects.toThrow();

    if (originalDsn !== undefined) {
      process.env.FLUXGRID_DSN = originalDsn;
    }
  });
});

