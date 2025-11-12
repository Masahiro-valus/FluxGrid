package handlers

import (
	"context"
	"database/sql"
	"fmt"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
)

func TestExecuteClassicSQL_Success(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New: %v", err)
	}

	rows := sqlmock.NewRowsWithColumnDefinition(
		sqlmock.NewColumn("id").OfType("INT", int64(0)),
		sqlmock.NewColumn("name").OfType("VARCHAR", ""),
	).AddRow(int64(1), "Alice").
		AddRow(int64(2), []byte("Bob"))

	mock.ExpectQuery("SELECT").
		WillReturnRows(rows)
	mock.ExpectClose()

	var payload executeParams
	payload.SQL = "SELECT id, name FROM users"
	payload.Connection.DSN = "mock"
	payload.Options.MaxRows = 10
	payload.Options.TimeoutSeconds = 5

	result, rpcErr := executeClassicSQL(
		context.Background(),
		payload,
		"mysql",
		func(context.Context, string) (*sql.DB, error) {
			return db, nil
		},
	)
	if rpcErr != nil {
		t.Fatalf("unexpected rpc error: %v", rpcErr)
	}

	execResult, ok := result.(executeResult)
	if !ok {
		t.Fatalf("unexpected result type %T", result)
	}

	if len(execResult.Columns) != 2 {
		t.Fatalf("expected 2 columns, got %d", len(execResult.Columns))
	}
	if execResult.Columns[0].Name != "id" || execResult.Columns[0].DataType != "INT" {
		t.Fatalf("unexpected column definition %+v", execResult.Columns[0])
	}
	if len(execResult.Rows) != 2 {
		t.Fatalf("expected 2 rows, got %d", len(execResult.Rows))
	}
	if execResult.Rows[1][1] != "Bob" {
		t.Fatalf("expected second row name to be Bob, got %#v", execResult.Rows[1][1])
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("expectations not met: %v", err)
	}
}

func TestExecuteClassicSQL_QueryError(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New: %v", err)
	}

	mock.ExpectQuery("SELECT").
		WillReturnError(fmt.Errorf("boom"))
	mock.ExpectClose()

	var payload executeParams
	payload.SQL = "SELECT 1"
	payload.Connection.DSN = "mock"
	payload.Options.MaxRows = 10
	payload.Options.TimeoutSeconds = 5

	_, rpcErr := executeClassicSQL(
		context.Background(),
		payload,
		"mysql",
		func(context.Context, string) (*sql.DB, error) {
			return db, nil
		},
	)
	if rpcErr == nil {
		t.Fatal("expected rpc error")
	}
	if rpcErr.Code != -32011 {
		t.Fatalf("unexpected rpc error code %d", rpcErr.Code)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("expectations not met: %v", err)
	}
}
