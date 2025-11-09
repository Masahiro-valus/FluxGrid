package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"time"

	"github.com/fluxgrid/core/internal/logging"
	"github.com/fluxgrid/core/internal/rpc"
	"github.com/jackc/pgx/v5"
)

const (
	version = "0.0.1"
)

// Register attaches all handlers to the RPC server.
func Register(server *rpc.Server) {
	server.Register("core.ping", pingHandler)
	server.Register("query.execute", executeHandler)
	server.Register("connect.test", connectTestHandler(defaultConnectionTester))
	server.RegisterNotification("query.cancel", cancelHandler(server))
}

func pingHandler(_ context.Context, _ json.RawMessage) (any, *rpc.Error) {
	return map[string]any{
		"status":  "ok",
		"version": version,
		"time":    time.Now().UTC().Format(time.RFC3339Nano),
	}, nil
}

type executeParams struct {
	Connection struct {
		Driver string `json:"driver"`
		DSN    string `json:"dsn"`
	} `json:"connection"`
	SQL     string `json:"sql"`
	Options struct {
		TimeoutSeconds int `json:"timeoutSeconds"`
		MaxRows        int `json:"maxRows"`
	} `json:"options"`
}

type executeResult struct {
	Columns         []column        `json:"columns"`
	Rows            [][]interface{} `json:"rows"`
	ExecutionTimeMs float64         `json:"executionTimeMs"`
}

type column struct {
	Name     string `json:"name"`
	DataType string `json:"dataType"`
}

type connectTestParams struct {
	Driver string `json:"driver"`
	DSN    string `json:"dsn"`
	Options connectTestOptions `json:"options"`
}

type connectTestOptions struct {
	TimeoutSeconds int    `json:"timeoutSeconds"`
	SSLMode        string `json:"sslmode"`
}

type connectTestResult struct {
	LatencyMs      float64           `json:"latencyMs"`
	ServerVersion  string            `json:"serverVersion"`
	ConnectionInfo map[string]string `json:"connectionInfo,omitempty"`
}

type connectionTester interface {
	TestConnection(ctx context.Context, params connectTestParams) (connectTestResult, error)
}

type postgresConnectionTester struct{}

func (postgresConnectionTester) TestConnection(ctx context.Context, params connectTestParams) (connectTestResult, error) {
	timeout := params.Options.TimeoutSeconds
	if timeout <= 0 {
		timeout = 15
	}

	timeoutCtx, cancel := context.WithTimeout(ctx, time.Duration(timeout)*time.Second)
	defer cancel()

	start := time.Now()
	conn, err := pgx.Connect(timeoutCtx, params.DSN)
	if err != nil {
		return connectTestResult{}, err
	}
	defer conn.Close(context.Background())

	var version string
	if err := conn.QueryRow(timeoutCtx, "select version()").Scan(&version); err != nil {
		return connectTestResult{}, err
	}

	info := map[string]string{
		"backend_pid": strconv.Itoa(int(conn.PgConn().PID())),
	}
	if appName := conn.PgConn().ParameterStatus("application_name"); appName != "" {
		info["application_name"] = appName
	}

	return connectTestResult{
		LatencyMs:      time.Since(start).Seconds() * 1000,
		ServerVersion:  version,
		ConnectionInfo: info,
	}, nil
}

var defaultConnectionTester connectionTester = postgresConnectionTester{}

func executeHandler(ctx context.Context, params json.RawMessage) (any, *rpc.Error) {
	var payload executeParams
	if len(params) > 0 {
		if err := json.Unmarshal(params, &payload); err != nil {
			return nil, &rpc.Error{
				Code:    -32602,
				Message: "invalid parameters",
				Data:    err.Error(),
			}
		}
	}

	if payload.SQL == "" {
		return nil, &rpc.Error{
			Code:    -32602,
			Message: "SQL is required",
		}
	}

	if payload.Connection.Driver == "" {
		return nil, &rpc.Error{
			Code:    -32602,
			Message: "driver is required",
		}
	}

	if payload.Connection.DSN == "" {
		return nil, &rpc.Error{
			Code:    -32602,
			Message: "DSN is required",
		}
	}

	if payload.Options.TimeoutSeconds <= 0 {
		payload.Options.TimeoutSeconds = 30
	}
	if payload.Options.MaxRows <= 0 {
		payload.Options.MaxRows = 500
	}

	switch payload.Connection.Driver {
	case "postgres":
	default:
		return nil, &rpc.Error{
			Code:    -32601,
			Message: fmt.Sprintf("driver not supported: %s", payload.Connection.Driver),
		}
	}

	timeoutCtx, cancel := context.WithTimeout(ctx, time.Duration(payload.Options.TimeoutSeconds)*time.Second)
	defer cancel()

	logger := logging.Logger()
	start := time.Now()

	conn, err := pgx.Connect(timeoutCtx, payload.Connection.DSN)
	if err != nil {
		return nil, &rpc.Error{
			Code:    -32010,
			Message: "failed to connect to database",
			Data:    err.Error(),
		}
	}
	defer conn.Close(context.Background())

	rows, err := conn.Query(timeoutCtx, payload.SQL)
	if err != nil {
		return nil, &rpc.Error{
			Code:    -32011,
			Message: "query execution failed",
			Data:    err.Error(),
		}
	}
	defer rows.Close()

	fields := rows.FieldDescriptions()
	columns := make([]column, len(fields))
	for i, field := range fields {
		columns[i] = column{
			Name:     field.Name,
			DataType: fmt.Sprintf("%d", field.DataTypeOID),
		}
	}

	var (
		resultRows [][]interface{}
		rowCount   int
	)

	for rows.Next() {
		if rowCount >= payload.Options.MaxRows {
			break
		}
		values, err := rows.Values()
		if err != nil {
			return nil, &rpc.Error{
				Code:    -32012,
				Message: "failed to read result row",
				Data:    err.Error(),
			}
		}

		row := make([]interface{}, len(values))
		for i, value := range values {
			row[i] = normalizeValue(value)
		}

		resultRows = append(resultRows, row)
		rowCount++
	}

	if err := rows.Err(); err != nil {
		return nil, &rpc.Error{
			Code:    -32012,
			Message: "error occurred while reading rows",
			Data:    err.Error(),
		}
	}

	duration := time.Since(start).Seconds() * 1000

	logger.Info().
		Str("driver", payload.Connection.Driver).
		Int("row_count", rowCount).
		Float64("duration_ms", duration).
		Msg("query.execute completed")

	return executeResult{
		Columns:         columns,
		Rows:            resultRows,
		ExecutionTimeMs: duration,
	}, nil
}

func cancelHandler(server *rpc.Server) rpc.NotificationFunc {
	return func(_ context.Context, params json.RawMessage) {
		type cancelPayload struct {
			RequestID json.RawMessage `json:"requestId"`
		}

		var payload cancelPayload
		if err := json.Unmarshal(params, &payload); err != nil {
			logger := logging.Logger()
			logger.Warn().Err(err).Msg("query.cancel: failed to parse parameters")
			return
		}

		if len(payload.RequestID) == 0 {
			return
		}

		var anyID interface{}
		if err := json.Unmarshal(payload.RequestID, &anyID); err != nil {
			id := string(payload.RequestID)
			server.Cancel(id)
			return
		}

		requestID := fmt.Sprint(anyID)
		if !server.Cancel(requestID) {
			logger := logging.Logger()
			logger.Warn().Str("request_id", requestID).Msg("query.cancel: request not found")
		}
	}
}

func connectTestHandler(tester connectionTester) rpc.HandlerFunc {
	return func(ctx context.Context, raw json.RawMessage) (any, *rpc.Error) {
		var payload connectTestParams
		if len(raw) == 0 {
			return nil, &rpc.Error{
				Code:    -32602,
				Message: "connection parameters are required",
			}
		}
		if err := json.Unmarshal(raw, &payload); err != nil {
			return nil, &rpc.Error{
				Code:    -32602,
				Message: "invalid parameters",
				Data:    err.Error(),
			}
		}
		if payload.Driver == "" {
			return nil, &rpc.Error{
				Code:    -32602,
				Message: "driver is required",
			}
		}
		if payload.DSN == "" {
			return nil, &rpc.Error{
				Code:    -32602,
				Message: "DSN is required",
			}
		}

		switch payload.Driver {
		case "postgres":
			// supported
		default:
			return nil, &rpc.Error{
				Code:    -32601,
				Message: fmt.Sprintf("driver not supported: %s", payload.Driver),
			}
		}

		result, err := tester.TestConnection(ctx, payload)
		if err != nil {
			return nil, &rpc.Error{
				Code:    -32020,
				Message: "connection test failed",
				Data:    err.Error(),
			}
		}

		return result, nil
	}
}

func normalizeValue(value interface{}) interface{} {
	switch v := value.(type) {
	case nil:
		return nil
	case time.Time:
		return v.UTC().Format(time.RFC3339Nano)
	case []byte:
		return string(v)
	case fmt.Stringer:
		return v.String()
	default:
		if err := ensureJSONCompatible(v); err != nil {
			return fmt.Sprint(v)
		}
		return v
	}
}

func ensureJSONCompatible(value interface{}) error {
	_, err := json.Marshal(value)
	return err
}

