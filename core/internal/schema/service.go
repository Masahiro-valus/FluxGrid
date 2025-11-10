package schema

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
)

// Conn models the subset of pgx connection behaviour used by the schema service.
type Conn interface {
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
}

// ListRequest controls schema listing behaviour.
type ListRequest struct {
	Search string
}

// ListResponse is a hierarchical representation of database schemas.
type ListResponse struct {
	Schemas []Schema `json:"schemas"`
}

// Schema represents a database schema.
type Schema struct {
	Name   string  `json:"name"`
	Tables []Table `json:"tables"`
}

// Table represents a table or view.
type Table struct {
	Name    string   `json:"name"`
	Type    string   `json:"type"` // table or view
	Columns []Column `json:"columns"`
}

// Column represents a column definition.
type Column struct {
	Name     string `json:"name"`
	DataType string `json:"dataType"`
	NotNull  bool   `json:"notNull"`
}

// DDLRequest identifies the database object whose DDL should be returned.
type DDLRequest struct {
	Schema string
	Name   string
}

// Service describes schema metadata operations.
type Service interface {
	List(ctx context.Context, conn Conn, req ListRequest) (ListResponse, error)
	GetDDL(ctx context.Context, conn Conn, req DDLRequest) (string, error)
}

var (
	// ErrNotFound signals that the requested object does not exist.
	ErrNotFound = errors.New("object not found")
)

// Ensure interfaces compile.
var _ Service = (*postgresService)(nil)
