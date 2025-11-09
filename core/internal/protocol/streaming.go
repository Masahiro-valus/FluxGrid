package protocol

// StreamChunk represents a chunk of rows emitted from the core engine. The extension
// may respond with acknowledgements to apply backpressure.
type StreamChunk struct {
	RequestID string
	Seq       int
	Rows      [][]any
	HasMore   bool
}

// StreamAck is sent by the extension to signal the core that it may continue streaming.
type StreamAck struct {
	RequestID string
	Seq       int
}

// StreamComplete captures terminal metadata about a streaming session.
type StreamComplete struct {
	RequestID string
	Cursor    string
	Statistics map[string]any
}

// StreamError represents a failure while streaming a result set.
type StreamError struct {
	RequestID string
	Code      string
	Message   string
	Fatal     bool
}

// StreamSession coordinates acknowledgement thresholds for a logical query stream.
type StreamSession struct {
	requestID     string
	highWaterMark int
	bufferedRows  int
	ackOut        chan<- StreamAck
}

// NewStreamSession constructs a session that will flush acknowledgements to ackOut when
// buffered rows reach the provided highWaterMark. A highWaterMark of zero disables auto-acks.
func NewStreamSession(requestID string, highWaterMark int, ackOut chan<- StreamAck) *StreamSession {
	if highWaterMark < 0 {
		highWaterMark = 0
	}
	return &StreamSession{
		requestID:     requestID,
		highWaterMark: highWaterMark,
		bufferedRows:  0,
		ackOut:        ackOut,
	}
}

// HandleChunk inspects the incoming chunk and emits a StreamAck when thresholds are met.
func (s *StreamSession) HandleChunk(chunk StreamChunk) {
	if chunk.RequestID != "" {
		s.requestID = chunk.RequestID
	}

	s.bufferedRows += len(chunk.Rows)
	if s.shouldAck(chunk.HasMore) {
		s.flushAck(chunk.Seq)
	}
}

// Reset clears the buffered state, intended to be called after completion or fatal errors.
func (s *StreamSession) Reset() {
	s.bufferedRows = 0
}

func (s *StreamSession) shouldAck(hasMore bool) bool {
	if s.highWaterMark == 0 {
		return !hasMore
	}

	if s.bufferedRows >= s.highWaterMark {
		return true
	}

	if !hasMore {
		return true
	}

	return false
}

func (s *StreamSession) flushAck(seq int) {
	if s.ackOut == nil {
		return
	}

	s.ackOut <- StreamAck{
		RequestID: s.requestID,
		Seq:       seq,
	}
	s.bufferedRows = 0
}

