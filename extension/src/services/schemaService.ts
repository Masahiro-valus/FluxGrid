import * as vscode from "vscode";
import { CoreClient } from "../coreClient";
import type { ConnectionService } from "./connectionService";
import type { HydratedConnection } from "../storage/connectionStore";
import { buildDsnFromConnection } from "../utils/dsn";

export interface SchemaNode {
  name: string;
  tables: Array<{
    name: string;
    type: string;
    columns: Array<{
      name: string;
      dataType: string;
      notNull: boolean;
    }>;
  }>;
}

export interface SchemaListOptions {
  connectionId?: string;
  search?: string;
  timeoutSeconds?: number;
}

interface SchemaListResponse {
  schemas?: SchemaNode[];
}

export class SchemaService {
  constructor(
    private readonly coreClient: CoreClient,
    private readonly connectionService: ConnectionService
  ) {}

  async list(options: SchemaListOptions = {}): Promise<SchemaNode[]> {
    const connection = await this.resolveConnection(options.connectionId);

    const payload = {
      connection: {
        driver: connection.driver,
        dsn: connection.dsn
      },
      options: {
        timeoutSeconds: options.timeoutSeconds ?? 15,
        search: options.search ?? ""
      }
    };

    const response = await this.coreClient.sendRequest<SchemaListResponse>("schema.list", payload);
    return response.schemas ?? [];
  }

  private async resolveConnection(connectionId?: string): Promise<{ driver: string; dsn: string }> {
    if (connectionId) {
      const connection = await this.connectionService.getConnection(connectionId, {
        includeSecrets: true
      });
      if (connection) {
        return {
          driver: connection.driver,
          dsn: buildDsnFromConnection(connection as HydratedConnection & { password?: string })
        };
      }
    }

    const settings = vscode.workspace.getConfiguration("fluxgrid");
    const fallbackDsn =
      settings.get<string>("developmentConnectionString") ?? process.env.FLUXGRID_DSN;

    if (!fallbackDsn) {
      throw new Error("No connection available for schema listing.");
    }

    return {
      driver: "postgres",
      dsn: fallbackDsn
    };
  }
}
