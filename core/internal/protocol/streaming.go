package protocol

import "context"

// StreamChunk represents a batch of rows emitted from the core engine.
type StreamChunk struct {
	RequestID string
	Seq       int
	Rows      [][]any
	HasMore   bool
}

// StreamAck is sent by the extension to signal that the core may continue streaming.
type StreamAck struct {
	RequestID string
	Seq       int
}

// StreamSession coordinates backpressure using acknowledgements from the extension.
type StreamSession struct {
	requestID     string
	highWaterMark int
	bufferedRows  int
	acks          <-chan StreamAck
}

// NewStreamSession constructs a session that waits for acknowledgements when buffered rows
// reach the provided highWaterMark. A highWaterMark of zero disables waiting.
func NewStreamSession(requestID string, highWaterMark int, acks <-chan StreamAck) *StreamSession {
	if highWaterMark < 0 {
		highWaterMark = 0
	}

	return &StreamSession{
		requestID:     requestID,
		highWaterMark: highWaterMark,
		acks:          acks,
	}
}

// HandleChunk accounts for the rows in the chunk and blocks until an acknowledgement is received
// when thresholds are hit. The provided context should be cancelled on stream abort.
func (s *StreamSession) HandleChunk(ctx context.Context, chunk StreamChunk) error {
	if s.highWaterMark == 0 {
		return nil
	}

	s.bufferedRows += len(chunk.Rows)
	if s.bufferedRows < s.highWaterMark && chunk.HasMore {
		return nil
	}

	for {
		select {
		case ack := <-s.acks:
			if ack.RequestID != "" && ack.RequestID != s.requestID {
				continue
			}
			if ack.Seq < chunk.Seq {
				continue
			}
			s.bufferedRows = 0
			return nil
		case <-ctx.Done():
			return ctx.Err()
		}
	}
}

// Reset clears buffered state; should be invoked when the stream completes or errors.
func (s *StreamSession) Reset() {
	s.bufferedRows = 0
}

