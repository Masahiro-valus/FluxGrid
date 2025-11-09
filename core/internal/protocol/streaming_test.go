package protocol

import (
	"testing"
)

func TestStreamSessionEmitsAckAtHighWaterMark(t *testing.T) {
	acks := make(chan StreamAck, 2)
	session := NewStreamSession("req-1", 3, acks)

	session.HandleChunk(StreamChunk{
		RequestID: "req-1",
		Seq:       1,
		Rows: [][]any{
			{1}, {2},
		},
		HasMore: true,
	})

	select {
	case <-acks:
		t.Fatalf("unexpected ack for first chunk")
	default:
	}

	session.HandleChunk(StreamChunk{
		RequestID: "req-1",
		Seq:       2,
		Rows: [][]any{
			{3},
		},
		HasMore: true,
	})

	select {
	case ack := <-acks:
		if ack.Seq != 2 {
			t.Fatalf("expected ack seq 2, got %d", ack.Seq)
		}
	default:
		t.Fatal("expected ack after reaching high water mark")
	}
}

func TestStreamSessionAckOnFinalChunkWhenBelowThreshold(t *testing.T) {
	acks := make(chan StreamAck, 1)
	session := NewStreamSession("req-1", 5, acks)

	session.HandleChunk(StreamChunk{
		RequestID: "req-1",
		Seq:       1,
		Rows: [][]any{
			{1},
			{2},
		},
		HasMore: false,
	})

	select {
	case ack := <-acks:
		if ack.Seq != 1 {
			t.Fatalf("expected final ack seq 1, got %d", ack.Seq)
		}
	default:
		t.Fatal("expected ack for final chunk even below threshold")
	}
}

func TestStreamSessionResetClearsBufferedRows(t *testing.T) {
	acks := make(chan StreamAck, 1)
	session := NewStreamSession("req-1", 2, acks)

	session.HandleChunk(StreamChunk{
		RequestID: "req-1",
		Seq:       1,
		Rows: [][]any{
			{1},
		},
		HasMore: true,
	})

	session.Reset()
	session.HandleChunk(StreamChunk{
		RequestID: "req-1",
		Seq:       2,
		Rows: [][]any{
			{2},
		},
		HasMore: false,
	})

	select {
	case ack := <-acks:
		if ack.Seq != 2 {
			t.Fatalf("expected ack seq 2 after reset, got %d", ack.Seq)
		}
	default:
		t.Fatal("expected ack after reset on final chunk")
	}
}

