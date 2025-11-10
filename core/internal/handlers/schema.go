package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/fluxgrid/core/internal/logging"
	"github.com/fluxgrid/core/internal/rpc"
	"github.com/fluxgrid/core/internal/schema"
	"github.com/jackc/pgx/v5"
)

type connectionFactory func(ctx context.Context, dsn string) (schema.Conn, func(), error)

var defaultSchemaService = schema.NewPostgresService()

type dbConnectionParams struct {
	Driver string `json:"driver"`
	DSN    string `json:"dsn"`
}

type schemaListOptions struct {
	TimeoutSeconds int    `json:"timeoutSeconds"`
	Search         string `json:"search"`
}

type schemaListParams struct {
	Connection dbConnectionParams `json:"connection"`
	Options    schemaListOptions  `json:"options"`
}

type schemaListResult struct {
	Schemas []schema.Schema `json:"schemas"`
}

func schemaListHandler(service schema.Service, factory connectionFactory) rpc.HandlerFunc {
	return func(ctx context.Context, params json.RawMessage) (any, *rpc.Error) {
		var payload schemaListParams
		if err := json.Unmarshal(params, &payload); err != nil {
			return nil, &rpc.Error{
				Code:    -32602,
				Message: "invalid parameters",
				Data:    err.Error(),
			}
		}

		if payload.Connection.Driver != "postgres" {
			return nil, &rpc.Error{
				Code:    -32601,
				Message: fmt.Sprintf("driver not supported: %s", payload.Connection.Driver),
			}
		}

		if payload.Connection.DSN == "" {
			return nil, &rpc.Error{
				Code:    -32602,
				Message: "DSN is required",
			}
		}

		timeout := payload.Options.TimeoutSeconds
		if timeout <= 0 {
			timeout = 15
		}

		timeoutCtx, cancelTimeout := context.WithTimeout(ctx, time.Duration(timeout)*time.Second)
		defer cancelTimeout()

		conn, cleanup, err := factory(timeoutCtx, payload.Connection.DSN)
		if err != nil {
			return nil, &rpc.Error{
				Code:    -32010,
				Message: "failed to connect to database",
				Data:    err.Error(),
			}
		}
		defer cleanup()

		result, err := service.List(timeoutCtx, conn, schema.ListRequest{
			Search: payload.Options.Search,
		})
		if err != nil {
			return nil, &rpc.Error{
				Code:    -32040,
				Message: "failed to list schema objects",
				Data:    err.Error(),
			}
		}

		return schemaListResult{Schemas: result.Schemas}, nil
	}
}

type ddlGetParams struct {
	Connection dbConnectionParams `json:"connection"`
	Target     struct {
		Schema string `json:"schema"`
		Name   string `json:"name"`
	} `json:"target"`
	Options struct {
		TimeoutSeconds int `json:"timeoutSeconds"`
	} `json:"options"`
}

type ddlGetResult struct {
	DDL string `json:"ddl"`
}

func ddlGetHandler(service schema.Service, factory connectionFactory) rpc.HandlerFunc {
	return func(ctx context.Context, params json.RawMessage) (any, *rpc.Error) {
		var payload ddlGetParams
		if err := json.Unmarshal(params, &payload); err != nil {
			return nil, &rpc.Error{
				Code:    -32602,
				Message: "invalid parameters",
				Data:    err.Error(),
			}
		}

		if payload.Connection.Driver != "postgres" {
			return nil, &rpc.Error{
				Code:    -32601,
				Message: fmt.Sprintf("driver not supported: %s", payload.Connection.Driver),
			}
		}

		if payload.Connection.DSN == "" {
			return nil, &rpc.Error{
				Code:    -32602,
				Message: "DSN is required",
			}
		}

		if payload.Target.Schema == "" || payload.Target.Name == "" {
			return nil, &rpc.Error{
				Code:    -32602,
				Message: "target schema and name are required",
			}
		}

		timeout := payload.Options.TimeoutSeconds
		if timeout <= 0 {
			timeout = 15
		}

		timeoutCtx, cancelTimeout := context.WithTimeout(ctx, time.Duration(timeout)*time.Second)
		defer cancelTimeout()

		conn, cleanup, err := factory(timeoutCtx, payload.Connection.DSN)
		if err != nil {
			return nil, &rpc.Error{
				Code:    -32010,
				Message: "failed to connect to database",
				Data:    err.Error(),
			}
		}
		defer cleanup()

		ddl, err := service.GetDDL(timeoutCtx, conn, schema.DDLRequest{
			Schema: payload.Target.Schema,
			Name:   payload.Target.Name,
		})
		if err != nil {
			if errors.Is(err, schema.ErrNotFound) {
				return nil, &rpc.Error{
					Code:    -32044,
					Message: "object not found",
				}
			}
			return nil, &rpc.Error{
				Code:    -32041,
				Message: "failed to retrieve DDL",
				Data:    err.Error(),
			}
		}

		return ddlGetResult{DDL: ddl}, nil
	}
}

func pgxConnectionFactory(ctx context.Context, dsn string) (schema.Conn, func(), error) {
	conn, err := pgx.Connect(ctx, dsn)
	if err != nil {
		return nil, nil, err
	}
	cleanup := func() {
		if cerr := conn.Close(context.Background()); cerr != nil {
			logger := logging.Logger()
			logger.Warn().Err(cerr).Msg("failed to close schema connection")
		}
	}
	return conn, cleanup, nil
}
