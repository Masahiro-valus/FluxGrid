type VsCodeApi<T> = {
  postMessage: (message: T) => void;
  setState: (state: unknown) => void;
  getState: <S>() => S | undefined;
};

declare function acquireVsCodeApi<T>(): VsCodeApi<T>;

export interface VscodeBridge<TMessage = unknown> {
  postMessage: (message: TMessage) => void;
  addMessageListener: (listener: (message: TMessage) => void) => () => void;
  setState: (state: unknown) => void;
  getState: <S>() => S | undefined;
}

export function createVscodeBridge<TMessage = unknown>(): VscodeBridge<TMessage> {
  const vscode: VsCodeApi<TMessage> | undefined =
    typeof acquireVsCodeApi === "function" ? acquireVsCodeApi<TMessage>() : undefined;

  return {
    postMessage: (message) => {
      if (vscode) {
        vscode.postMessage(message);
      } else {
        console.info("[FluxGrid] postMessage (mock)", message);
      }
    },
    addMessageListener: (listener) => {
      const handler = (event: MessageEvent) => listener(event.data as TMessage);
      window.addEventListener("message", handler);
      return () => window.removeEventListener("message", handler);
    },
    setState: (state) => vscode?.setState(state),
    getState: () => vscode?.getState()
  };
}
