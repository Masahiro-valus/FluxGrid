package protocol

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestStreamSessionWaitsForAckAtHighWaterMark(t *testing.T) {
	ackCh := make(chan StreamAck, 1)
	session := NewStreamSession("req-1", 3, ackCh)

	ctx, cancel := context.WithTimeout(context.Background(), time.Millisecond*100)
	defer cancel()

	if err := session.HandleChunk(ctx, StreamChunk{
		RequestID: "req-1",
		Seq:       1,
		Rows: [][]any{
			{1}, {2},
		},
		HasMore: true,
	}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	done := make(chan error, 1)
	go func() {
		done <- session.HandleChunk(ctx, StreamChunk{
			RequestID: "req-1",
			Seq:       2,
			Rows: [][]any{
				{3},
			},
			HasMore: true,
		})
	}()

	select {
	case err := <-done:
		if err == nil {
			t.Fatal("expected handler to block until ack")
		}
	default:
	}

	ackCh <- StreamAck{RequestID: "req-1", Seq: 2}

	if err := <-done; err != nil {
		t.Fatalf("expected nil error after ack, got %v", err)
	}
}

func TestStreamSessionFlushesOnFinalChunk(t *testing.T) {
	ackCh := make(chan StreamAck, 1)
	session := NewStreamSession("req-1", 5, ackCh)

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()

	err := session.HandleChunk(ctx, StreamChunk{
		RequestID: "req-1",
		Seq:       1,
		Rows: [][]any{
			{1},
			{2},
		},
		HasMore: false,
	})

	if err == nil || !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("expected deadline exceeded, got %v", err)
	}
}

func TestStreamSessionResetClearsBufferedRows(t *testing.T) {
	ackCh := make(chan StreamAck, 1)
	session := NewStreamSession("req-1", 2, ackCh)

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()

	if err := session.HandleChunk(ctx, StreamChunk{
		RequestID: "req-1",
		Seq:       1,
		Rows: [][]any{
			{1},
		},
		HasMore: true,
	}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	session.Reset()

	done := make(chan error, 1)
	go func() {
		done <- session.HandleChunk(ctx, StreamChunk{
			RequestID: "req-1",
			Seq:       2,
			Rows: [][]any{
				{2},
			},
			HasMore: false,
		})
	}()

	select {
	case err := <-done:
		if err == nil {
			t.Fatal("expected block until ack after reset")
		}
	default:
	}

	ackCh <- StreamAck{RequestID: "req-1", Seq: 2}

	if err := <-done; err != nil {
		t.Fatalf("unexpected error after ack: %v", err)
	}
}

