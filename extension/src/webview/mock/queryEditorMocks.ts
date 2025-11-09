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
    label: "public",
    children: [{ label: "customers" }, { label: "orders" }, { label: "payments" }]
  },
  {
    label: "analytics",
    children: [{ label: "daily_revenue" }, { label: "monthly_summary" }]
  }
];

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
