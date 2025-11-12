package handlers

import (
	"context"
	"encoding/json"
	"net/url"
	"os"
	"strings"
	"testing"
)

func TestConnectTestHandler_Postgres_Success(t *testing.T) {
	dsn := os.Getenv("FLUXGRID_PG_DSN")
	if dsn == "" {
		t.Skip("FLUXGRID_PG_DSN not set, skipping integration test")
	}

	handler := connectTestHandler(defaultConnectionTesters())

	payload := connectTestParams{
		Driver: "postgres",
		DSN:    dsn,
		Options: connectTestOptions{
			TimeoutSeconds: 10,
		},
	}

	raw, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}

	result, rpcErr := handler(context.Background(), raw)
	if rpcErr != nil {
		t.Fatalf("connect.test returned error: %+v", rpcErr)
	}

	connectResult, ok := result.(connectTestResult)
	if !ok {
		t.Fatalf("unexpected result type %T", result)
	}

	if connectResult.ServerVersion == "" {
		t.Fatalf("expected server version value, got empty string")
	}
	if connectResult.LatencyMs <= 0 {
		t.Fatalf("expected positive latency, got %f", connectResult.LatencyMs)
	}
}

func TestConnectTestHandler_Postgres_InvalidPassword(t *testing.T) {
	dsn := os.Getenv("FLUXGRID_PG_DSN")
	if dsn == "" {
		t.Skip("FLUXGRID_PG_DSN not set, skipping integration test")
	}

	u, err := url.Parse(dsn)
	if err != nil {
		t.Fatalf("parse dsn: %v", err)
	}

	if u.User == nil {
		t.Skip("DSN does not contain credentials, skipping negative test")
	}

	user := u.User.Username()
	// craft obviously invalid password to trigger auth failure
	u.User = url.UserPassword(user, "invalid-password")

	handler := connectTestHandler(defaultConnectionTesters())

	payload := connectTestParams{
		Driver: "postgres",
		DSN:    u.String(),
		Options: connectTestOptions{
			TimeoutSeconds: 5,
		},
	}

	raw, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}

	_, rpcErr := handler(context.Background(), raw)
	if rpcErr == nil {
		t.Fatal("expected rpc error for invalid credentials")
	}
	if rpcErr.Code != -32020 {
		t.Fatalf("unexpected error code %d", rpcErr.Code)
	}

	if rpcErr.Data == nil {
		t.Fatal("expected error details")
	}

	if msg, ok := rpcErr.Data.(string); ok {
		if !strings.Contains(strings.ToLower(msg), "password") {
			t.Fatalf("expected password error in message, got %q", msg)
		}
	}
}
