package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/fluxgrid/core/internal/logging"
	"github.com/fluxgrid/core/internal/rpc"
	"github.com/jackc/pgx/v5"
)

const (
	version = "0.0.1"
)

// Register は全ハンドラーをサーバーへ登録する。
func Register(server *rpc.Server) {
	server.Register("core.ping", pingHandler)
	server.Register("query.execute", executeHandler)
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

func executeHandler(ctx context.Context, params json.RawMessage) (any, *rpc.Error) {
	var payload executeParams
	if len(params) > 0 {
		if err := json.Unmarshal(params, &payload); err != nil {
			return nil, &rpc.Error{
				Code:    -32602,
				Message: "不正なパラメータ形式です",
				Data:    err.Error(),
			}
		}
	}

	if payload.SQL == "" {
		return nil, &rpc.Error{
			Code:    -32602,
			Message: "実行するSQLが必要です",
		}
	}

	if payload.Connection.Driver == "" {
		return nil, &rpc.Error{
			Code:    -32602,
			Message: "接続ドライバーが未指定です",
		}
	}

	if payload.Connection.DSN == "" {
		return nil, &rpc.Error{
			Code:    -32602,
			Message: "接続文字列(DSN)が未指定です",
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
			Message: fmt.Sprintf("未対応のドライバーです: %s", payload.Connection.Driver),
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
			Message: "データベース接続に失敗しました",
			Data:    err.Error(),
		}
	}
	defer conn.Close(context.Background())

	rows, err := conn.Query(timeoutCtx, payload.SQL)
	if err != nil {
		return nil, &rpc.Error{
			Code:    -32011,
			Message: "クエリ実行に失敗しました",
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
				Message: "結果の読み取りに失敗しました",
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
			Message: "結果の読み取り中にエラーが発生しました",
			Data:    err.Error(),
		}
	}

	duration := time.Since(start).Seconds() * 1000

	logger.Info().
		Str("driver", payload.Connection.Driver).
		Int("row_count", rowCount).
		Float64("duration_ms", duration).
		Msg("query.execute 完了")

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
			logging.Logger().Warn().Err(err).Msg("query.cancel: パラメータ解析に失敗")
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
			logging.Logger().Warn().Str("request_id", requestID).Msg("query.cancel: 該当リクエストなし")
		}
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

