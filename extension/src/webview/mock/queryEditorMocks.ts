export const mockConnections = [
  {
    id: "local-postgres",
    name: "Local Postgres",
    driver: "postgres",
    host: "localhost",
    port: 55432,
    database: "fluxgrid",
    username: "fluxgrid"
  },
  {
    id: "analytics",
    name: "Analytics Warehouse",
    driver: "postgres",
    host: "analytics.internal",
    port: 5432,
    database: "warehouse",
    username: "etl"
  }
];

export const mockSchema = [
  {
    name: "public",
    tables: [
      {
        name: "customers",
        type: "table",
        columns: [
          { name: "id", dataType: "integer", notNull: true },
          { name: "name", dataType: "text", notNull: false },
          { name: "email", dataType: "text", notNull: false }
        ]
      },
      {
        name: "orders",
        type: "table",
        columns: [
          { name: "id", dataType: "integer", notNull: true },
          { name: "customer_id", dataType: "integer", notNull: true },
          { name: "total", dataType: "numeric", notNull: true }
        ]
      }
    ]
  },
  {
    name: "analytics",
    tables: [
      {
        name: "daily_revenue",
        type: "view",
        columns: [
          { name: "day", dataType: "date", notNull: true },
          { name: "revenue", dataType: "numeric", notNull: true }
        ]
      }
    ]
  }
];

export const mockDdl = `CREATE TABLE public.customers (
  id integer PRIMARY KEY,
  name text,
  email text
);`;

export const mockResult = {
  columns: [
    { name: "id", dataType: "int8" },
    { name: "customer_name", dataType: "text" },
    { name: "total", dataType: "numeric" }
  ],
  rows: Array.from({ length: 1000 }).map((_, idx) => [
    idx + 1,
    `Customer ${idx + 1}`,
    (Math.random() * 1000).toFixed(2)
  ]),
  executionTimeMs: 12.4
};

export const mockLogs = [
  {
    level: "info" as const,
    message: "Started query execution",
    timestamp: new Date().toISOString()
  },
  {
    level: "info" as const,
    message: "Fetched 1,000 rows",
    timestamp: new Date().toISOString()
  }
];
