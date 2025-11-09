import * as vscode from "vscode";
import { ConnectionStore } from "./connectionStore";

let instance: ConnectionStore | undefined;

export function getConnectionStore(context: vscode.ExtensionContext): ConnectionStore {
  if (!instance) {
    instance = new ConnectionStore({
      secretStorage: context.secrets,
      stateStorage: context.globalState
    });
  }

  return instance;
}

export function disposeConnectionStore(): void {
  instance = undefined;
}
