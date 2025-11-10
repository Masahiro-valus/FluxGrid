import * as vscode from "vscode";
import { CoreClient } from "../coreClient";
import type { ConnectionService } from "./connectionService";
import type { HydratedConnection } from "../storage/connectionStore";
import { buildDsnFromConnection } from "../utils/dsn";
import { LogService } from "./logService";

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
    private readonly connectionService: ConnectionService,
    private readonly logService?: LogService
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

    try {
      const response = await this.coreClient.sendRequest<SchemaListResponse>(
        "schema.list",
        payload
      );
      this.logService?.append({
        level: "info",
        source: "extension",
        message: "Schema list retrieved."
      });
      return response.schemas ?? [];
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logService?.append({
        level: "error",
        source: "extension",
        message: `Schema list failed: ${err.message}`
      });
      throw err;
    }
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

  async getDDL(target: { schema: string; name: string; connectionId?: string }): Promise<string> {
    if (!target.schema || !target.name) {
      throw new Error("schema and name are required");
    }

    const connection = await this.resolveConnection(target.connectionId);

    try {
      const response = await this.coreClient.sendRequest<{ ddl?: string }>("ddl.get", {
        connection,
        target: {
          schema: target.schema,
          name: target.name
        },
        options: {
          timeoutSeconds: 15
        }
      });

      if (!response.ddl) {
        throw new Error("DDL not available.");
      }

      this.logService?.append({
        level: "info",
        source: "extension",
        message: `Fetched DDL for ${target.schema}.${target.name}`
      });
      return response.ddl;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logService?.append({
        level: "error",
        source: "extension",
        message: `Failed to load DDL for ${target.schema}.${target.name}: ${err.message}`
      });
      throw err;
    }
  }
}
