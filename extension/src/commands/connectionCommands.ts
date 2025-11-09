import * as vscode from "vscode";
import type { ConnectionInput } from "../storage/connectionStore";
import { ConnectionService } from "../services/connectionService";

export const CONNECTION_COMMAND_IDS = {
  list: "fluxgrid.connection.list",
  add: "fluxgrid.connection.add",
  update: "fluxgrid.connection.update",
  delete: "fluxgrid.connection.delete",
  get: "fluxgrid.connection.get"
} as const;

type CommandRegistrar = Pick<typeof vscode.commands, "registerCommand">;
type ExtensionContextLike = Pick<vscode.ExtensionContext, "subscriptions">;

export function registerConnectionCommands(
  context: ExtensionContextLike,
  service: ConnectionService,
  commandApi: CommandRegistrar = vscode.commands
): void {
  const disposables: vscode.Disposable[] = [
    commandApi.registerCommand(CONNECTION_COMMAND_IDS.list, () => service.listConnections()),
    commandApi.registerCommand(CONNECTION_COMMAND_IDS.add, (input: ConnectionInput) =>
      service.createConnection(input)
    ),
    commandApi.registerCommand(
      CONNECTION_COMMAND_IDS.update,
      (input: ConnectionInput & { id: string }) => service.updateConnection(input)
    ),
    commandApi.registerCommand(CONNECTION_COMMAND_IDS.delete, (id: string) =>
      service.deleteConnection(id)
    ),
    commandApi.registerCommand(
      CONNECTION_COMMAND_IDS.get,
      (id: string, opts?: { includeSecrets?: boolean }) => service.getConnection(id, opts)
    )
  ];

  context.subscriptions.push(...disposables);
}

