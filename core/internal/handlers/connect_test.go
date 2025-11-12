package handlers

import (
	"context"
	"encoding/json"
	"testing"
)

type stubConnectionTester struct {
	result connectTestResult
	err    error
	calls  int
}

func (s *stubConnectionTester) TestConnection(ctx context.Context, payload connectTestParams) (connectTestResult, error) {
	s.calls++
	return s.result, s.err
}

func TestConnectTestHandler_Success(t *testing.T) {
	tester := &stubConnectionTester{
		result: connectTestResult{
			LatencyMs:      12.3,
			ServerVersion:  "PostgreSQL 15.3",
			ConnectionInfo: map[string]string{"application_name": "fluxgrid"},
		},
	}
	handler := connectTestHandler(map[string]connectionTester{
		"postgres": tester,
	})

	rawParams, err := json.Marshal(connectTestParams{
		Driver: "postgres",
		DSN:    "postgresql://example",
		Options: connectTestOptions{
			TimeoutSeconds: 10,
		},
	})
	if err != nil {
		t.Fatalf("marshal params: %v", err)
	}

	result, rpcErr := handler(context.Background(), rawParams)
	if rpcErr != nil {
		t.Fatalf("expected no rpc error, got %v", rpcErr)
	}

	if tester.calls != 1 {
		t.Fatalf("expected tester to be called once, got %d", tester.calls)
	}

	payload, ok := result.(connectTestResult)
	if !ok {
		t.Fatalf("unexpected result type %T", result)
	}

	if payload.ServerVersion != "PostgreSQL 15.3" {
		t.Fatalf("unexpected server version %q", payload.ServerVersion)
	}
	if payload.LatencyMs <= 0 {
		t.Fatalf("expected latency to be positive, got %f", payload.LatencyMs)
	}
}

func TestConnectTestHandler_UnsupportedDriver(t *testing.T) {
	tester := &stubConnectionTester{}
	handler := connectTestHandler(map[string]connectionTester{
		"postgres": tester,
	})

	rawParams, err := json.Marshal(connectTestParams{
		Driver: "oracle",
		DSN:    "oracle://example",
	})
	if err != nil {
		t.Fatalf("marshal params: %v", err)
	}

	_, rpcErr := handler(context.Background(), rawParams)
	if rpcErr == nil {
		t.Fatal("expected rpc error for unsupported driver")
	}
	if rpcErr.Code != -32601 {
		t.Fatalf("unexpected rpc error code %d", rpcErr.Code)
	}
}

func TestConnectTestHandler_InvalidPayload(t *testing.T) {
	tester := &stubConnectionTester{}
	handler := connectTestHandler(map[string]connectionTester{
		"postgres": tester,
	})

	_, rpcErr := handler(context.Background(), json.RawMessage(`{"driver":123}`))
	if rpcErr == nil {
		t.Fatal("expected rpc error for invalid payload")
	}
	if rpcErr.Code != -32602 {
		t.Fatalf("unexpected rpc error code %d", rpcErr.Code)
	}
}
