import type { HydratedConnection } from "../storage/connectionStore";

function encode(value: string | undefined): string {
  return value ? encodeURIComponent(value) : "";
}

export function buildDsnFromConnection(
  connection: HydratedConnection & { password?: string }
): string {
  const raw =
    connection.options && typeof (connection.options as Record<string, unknown>).raw === "string"
      ? ((connection.options as Record<string, unknown>).raw as string)
      : undefined;

  if (raw) {
    return raw;
  }

  const host = connection.host ?? "";
  const port = connection.port ? `:${connection.port}` : "";
  const database = connection.database ?? "";
  const username = encode(connection.username);
  const password = encode(connection.password);
  const auth = username && password ? `${username}:${password}@` : username ? `${username}@` : "";

  switch (connection.driver) {
    case "mysql": {
      const authSegment =
        username || password ? `${username}${password ? `:${password}` : ""}@` : "";
      return `${authSegment}tcp(${host}${port})/${database}`;
    }
    case "sqlite":
      return connection.database || connection.host;
    case "postgres":
    default: {
      const ssl =
        connection.options &&
        typeof (connection.options as Record<string, unknown>).ssl === "boolean"
          ? ((connection.options as Record<string, unknown>).ssl as boolean)
          : false;
      const sslMode = ssl ? "require" : "disable";
      return `postgresql://${auth}${host}${port}/${database}?sslmode=${sslMode}`;
    }
  }
}
