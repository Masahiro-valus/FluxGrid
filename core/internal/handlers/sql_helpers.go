package handlers

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/fluxgrid/core/internal/logging"
	"github.com/fluxgrid/core/internal/rpc"
	_ "github.com/go-sql-driver/mysql"
	_ "modernc.org/sqlite"
)

type sqlOpener func(ctx context.Context, dsn string) (*sql.DB, error)

func defaultSQLOpener(driverName string) sqlOpener {
	return func(_ context.Context, dsn string) (*sql.DB, error) {
		db, err := sql.Open(driverName, dsn)
		if err != nil {
			return nil, err
		}
		return db, nil
	}
}

func executeClassicSQL(
	ctx context.Context,
	payload executeParams,
	driverName string,
	open sqlOpener,
) (any, *rpc.Error) {
	timeoutCtx, cancel := context.WithTimeout(ctx, time.Duration(payload.Options.TimeoutSeconds)*time.Second)
	defer cancel()

	db, err := open(timeoutCtx, payload.Connection.DSN)
	if err != nil {
		return nil, &rpc.Error{
			Code:    -32010,
			Message: "failed to connect to database",
			Data:    err.Error(),
		}
	}
	defer db.Close()

	start := time.Now()

	rows, err := db.QueryContext(timeoutCtx, payload.SQL)
	if err != nil {
		return nil, &rpc.Error{
			Code:    -32011,
			Message: "query execution failed",
			Data:    err.Error(),
		}
	}
	defer rows.Close()

	columnNames, err := rows.Columns()
	if err != nil {
		return nil, &rpc.Error{
			Code:    -32012,
			Message: "failed to read result columns",
			Data:    err.Error(),
		}
	}

	columnTypes, err := rows.ColumnTypes()
	if err != nil || len(columnTypes) != len(columnNames) {
		columnTypes = nil
	}

	columns := make([]column, len(columnNames))
	for i, name := range columnNames {
		dataType := ""
		if columnTypes != nil {
			dataType = columnTypes[i].DatabaseTypeName()
		}
		if dataType == "" {
			dataType = "text"
		}
		columns[i] = column{
			Name:     name,
			DataType: dataType,
		}
	}

	var (
		resultRows [][]interface{}
		rowCount   int
	)

	rawValues := make([]interface{}, len(columnNames))
	scanTargets := make([]interface{}, len(columnNames))
	for i := range rawValues {
		scanTargets[i] = &rawValues[i]
	}

	for rows.Next() {
		if rowCount >= payload.Options.MaxRows {
			break
		}
		for i := range rawValues {
			rawValues[i] = nil
		}
		if err := rows.Scan(scanTargets...); err != nil {
			return nil, &rpc.Error{
				Code:    -32012,
				Message: "failed to read result row",
				Data:    err.Error(),
			}
		}

		row := make([]interface{}, len(columnNames))
		for i, value := range rawValues {
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

	logger := logging.Logger()
	logger.Info().
		Str("driver", driverName).
		Int("row_count", rowCount).
		Float64("duration_ms", duration).
		Msg("query.execute completed")

	return executeResult{
		Columns:         columns,
		Rows:            resultRows,
		ExecutionTimeMs: duration,
	}, nil
}

type mysqlConnectionTester struct {
	open sqlOpener
}

func newMySQLConnectionTester() connectionTester {
	return &mysqlConnectionTester{open: defaultSQLOpener("mysql")}
}

func (m *mysqlConnectionTester) TestConnection(ctx context.Context, params connectTestParams) (connectTestResult, error) {
	timeout := params.Options.TimeoutSeconds
	if timeout <= 0 {
		timeout = 15
	}

	timeoutCtx, cancel := context.WithTimeout(ctx, time.Duration(timeout)*time.Second)
	defer cancel()

	db, err := m.open(timeoutCtx, params.DSN)
	if err != nil {
		return connectTestResult{}, err
	}
	defer db.Close()

	start := time.Now()

	if err := db.PingContext(timeoutCtx); err != nil {
		return connectTestResult{}, err
	}

	var version string
	if err := db.QueryRowContext(timeoutCtx, "SELECT VERSION()").Scan(&version); err != nil {
		return connectTestResult{}, err
	}

	info := map[string]string{}
	if params.DSN != "" {
		info["dsn"] = params.DSN
	}

	return connectTestResult{
		LatencyMs:      time.Since(start).Seconds() * 1000,
		ServerVersion:  version,
		ConnectionInfo: info,
	}, nil
}

type sqliteConnectionTester struct {
	open sqlOpener
}

func newSQLiteConnectionTester() connectionTester {
	return &sqliteConnectionTester{open: defaultSQLOpener("sqlite")}
}

func (s *sqliteConnectionTester) TestConnection(ctx context.Context, params connectTestParams) (connectTestResult, error) {
	timeout := params.Options.TimeoutSeconds
	if timeout <= 0 {
		timeout = 15
	}

	timeoutCtx, cancel := context.WithTimeout(ctx, time.Duration(timeout)*time.Second)
	defer cancel()

	db, err := s.open(timeoutCtx, params.DSN)
	if err != nil {
		return connectTestResult{}, err
	}
	defer db.Close()

	start := time.Now()

	if err := db.PingContext(timeoutCtx); err != nil {
		return connectTestResult{}, err
	}

	var version string
	if err := db.QueryRowContext(timeoutCtx, "SELECT sqlite_version()").Scan(&version); err != nil {
		return connectTestResult{}, err
	}

	info := map[string]string{
		"dsn": params.DSN,
	}

	return connectTestResult{
		LatencyMs:      time.Since(start).Seconds() * 1000,
		ServerVersion:  fmt.Sprintf("SQLite %s", version),
		ConnectionInfo: info,
	}, nil
}
