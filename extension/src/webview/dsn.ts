import type { ConnectionInput, HydratedConnection } from "../storage/connectionStore";

type ConnectionLike = Pick<
  HydratedConnection & ConnectionInput,
  "driver" | "host" | "port" | "database" | "username" | "password" | "options"
>;

function encodeCredential(value?: string): string {
  return value ? encodeURIComponent(value) : "";
}

export function buildDsn(connection: ConnectionLike): string {
  if (connection.options && typeof connection.options.raw === "string") {
    return connection.options.raw;
  }

  const portSegment = connection.port ? `:${connection.port}` : "";
  const username = encodeCredential(connection.username);
  const password = encodeCredential(connection.password);
  const authSegment = username ? `${username}${password ? `:${password}` : ""}@` : "";

  switch (connection.driver) {
    case "mysql": {
      const auth = username || password ? `${username}${password ? `:${password}` : ""}@` : "";
      return `${auth}tcp(${connection.host}${portSegment})/${connection.database ?? ""}`;
    }
    case "sqlite":
      return connection.database || connection.host;
    case "postgres":
    default: {
      const ssl =
        connection.options && typeof connection.options.ssl === "boolean"
          ? connection.options.ssl
            ? "require"
            : "disable"
          : "disable";
      return `postgresql://${authSegment}${connection.host}${portSegment}/${connection.database ?? ""}?sslmode=${ssl}`;
    }
  }
}
