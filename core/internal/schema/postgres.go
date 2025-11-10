package schema

import (
	"context"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5/pgtype"
)

// postgresService implements schema metadata lookups backed by pg_catalog.
type postgresService struct{}

// NewPostgresService constructs a schema service for PostgreSQL.
func NewPostgresService() Service {
	return &postgresService{}
}

const listQuery = `
SELECT
  n.nspname AS schema_name,
  c.relname AS table_name,
  c.relkind AS table_type,
  a.attname AS column_name,
  pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type,
  a.attnotnull AS not_null
FROM pg_catalog.pg_namespace n
JOIN pg_catalog.pg_class c ON c.relnamespace = n.oid
LEFT JOIN pg_catalog.pg_attribute a
  ON a.attrelid = c.oid
  AND a.attnum > 0
  AND NOT a.attisdropped
WHERE
  n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND c.relkind IN ('r', 'v')
  AND (
    $1 = ''
    OR n.nspname ILIKE $2
    OR c.relname ILIKE $2
    OR (a.attname IS NOT NULL AND a.attname ILIKE $2)
  )
ORDER BY n.nspname, c.relname, a.attnum;
`

func (postgresService) List(ctx context.Context, conn Conn, req ListRequest) (ListResponse, error) {
	search := strings.TrimSpace(req.Search)
	pattern := "%"
	if search != "" {
		pattern = "%" + strings.ToLower(search) + "%"
	}

	rows, err := conn.Query(ctx, listQuery, search, pattern)
	if err != nil {
		return ListResponse{}, err
	}
	defer rows.Close()

	var response ListResponse
	var (
		currentSchema *Schema
		currentTable  *Table
		lastSchema    string
		lastTable     string
	)

	for rows.Next() {
		var (
			schemaName string
			tableName  string
			relKind    string
			columnName pgtype.Text
			dataType   pgtype.Text
			notNull    pgtype.Bool
		)

		if err := rows.Scan(&schemaName, &tableName, &relKind, &columnName, &dataType, &notNull); err != nil {
			return ListResponse{}, err
		}

		if currentSchema == nil || schemaName != lastSchema {
			response.Schemas = append(response.Schemas, Schema{
				Name: schemaName,
			})
			currentSchema = &response.Schemas[len(response.Schemas)-1]
			lastSchema = schemaName
			currentTable = nil
			lastTable = ""
		}

		if currentTable == nil || tableName != lastTable {
			tableType := "table"
			if relKind == "v" {
				tableType = "view"
			}
			currentSchema.Tables = append(currentSchema.Tables, Table{
				Name: tableName,
				Type: tableType,
			})
			currentTable = &currentSchema.Tables[len(currentSchema.Tables)-1]
			lastTable = tableName
		}

		if columnName.Valid && dataType.Valid {
			notNullValue := false
			if notNull.Valid {
				notNullValue = notNull.Bool
			}
			currentTable.Columns = append(currentTable.Columns, Column{
				Name:     columnName.String,
				DataType: dataType.String,
				NotNull:  notNullValue,
			})
		}
	}

	if err := rows.Err(); err != nil {
		return ListResponse{}, err
	}

	return response, nil
}

const ddlQuery = `
SELECT
  CASE
    WHEN c.relkind = 'v' THEN
      'CREATE OR REPLACE VIEW '
      || quote_ident(n.nspname)
      || '.'
      || quote_ident(c.relname)
      || E' AS\n'
      || pg_catalog.pg_get_viewdef(c.oid, true)
    ELSE pg_catalog.pg_get_tabledef(c.oid)
  END AS ddl
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = $1
  AND c.relname = $2
  AND c.relkind IN ('r', 'v')
LIMIT 1;
`

func (postgresService) GetDDL(ctx context.Context, conn Conn, req DDLRequest) (string, error) {
	if strings.TrimSpace(req.Schema) == "" || strings.TrimSpace(req.Name) == "" {
		return "", fmt.Errorf("schema and name are required")
	}

	rows, err := conn.Query(ctx, ddlQuery, req.Schema, req.Name)
	if err != nil {
		return "", err
	}
	defer rows.Close()

	if !rows.Next() {
		return "", ErrNotFound
	}

	var ddl string
	if err := rows.Scan(&ddl); err != nil {
		return "", err
	}

	if err := rows.Err(); err != nil {
		return "", err
	}

	return ddl, nil
}
