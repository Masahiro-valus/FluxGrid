package schema

import (
	"context"
	"testing"

	pgxmock "github.com/pashagolub/pgxmock/v2"
)

func TestPostgresServiceList(t *testing.T) {
	mock, err := pgxmock.NewConn()
	if err != nil {
		t.Fatalf("pgxmock: %v", err)
	}
	defer mock.Close(context.Background())

	rows := pgxmock.NewRows([]string{
		"schema_name", "table_name", "table_type", "column_name", "data_type", "is_nullable",
	}).
		AddRow("public", "customers", "BASE TABLE", "id", "integer", false).
		AddRow("public", "customers", "BASE TABLE", "name", "text", true).
		AddRow("public", "orders", "BASE TABLE", "id", "integer", false)

	mock.ExpectQuery(`SELECT\s+n\.nspname AS schema_name`).
		WithArgs("", "%").
		WillReturnRows(rows)

	service := NewPostgresService()
	result, err := service.List(context.Background(), mock, ListRequest{Search: ""})
	if err != nil {
		t.Fatalf("List returned error: %v", err)
	}

	if len(result.Schemas) != 1 {
		t.Fatalf("expected 1 schema, got %d", len(result.Schemas))
	}

	schema := result.Schemas[0]
	if schema.Name != "public" {
		t.Fatalf("expected schema 'public', got %s", schema.Name)
	}

	if len(schema.Tables) != 2 {
		t.Fatalf("expected 2 tables, got %d", len(schema.Tables))
	}

	customers := schema.Tables[0]
	if customers.Name != "customers" || len(customers.Columns) != 2 {
		t.Fatalf("unexpected customers table %+v", customers)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("expectations were not met: %v", err)
	}
}

func TestPostgresServiceGetDDL(t *testing.T) {
	mock, err := pgxmock.NewConn()
	if err != nil {
		t.Fatalf("pgxmock: %v", err)
	}
	defer mock.Close(context.Background())

	rows := pgxmock.NewRows([]string{"ddl"}).
		AddRow("CREATE TABLE public.customers (id integer);")

	mock.ExpectQuery(`SELECT\s+CASE`).
		WithArgs("public", "customers").
		WillReturnRows(rows)

	service := NewPostgresService()
	ddl, err := service.GetDDL(context.Background(), mock, DDLRequest{
		Schema: "public",
		Name:   "customers",
	})
	if err != nil {
		t.Fatalf("GetDDL returned error: %v", err)
	}

	if ddl == "" {
		t.Fatal("expected ddl string, got empty")
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("expectations were not met: %v", err)
	}
}
