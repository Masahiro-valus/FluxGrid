package rpc

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"sync"

	"github.com/rs/zerolog"
)

type (
	// HandlerFunc processes JSON-RPC requests.
	HandlerFunc func(ctx context.Context, params json.RawMessage) (any, *Error)

	// NotificationFunc processes JSON-RPC notifications.
	NotificationFunc func(ctx context.Context, params json.RawMessage)
)

// Error represents a JSON-RPC error payload.
type Error struct {
	Code    int         `json:"code"`
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
}

// Request models a JSON-RPC request.
type Request struct {
	JSONRPC string          `json:"jsonrpc"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params,omitempty"`
	ID      *json.RawMessage `json:"id,omitempty"`
}

// Response models a JSON-RPC response.
type Response struct {
	JSONRPC string       `json:"jsonrpc"`
	Result  interface{}  `json:"result,omitempty"`
	Error   *Error       `json:"error,omitempty"`
	ID      *json.RawMessage `json:"id,omitempty"`
}

// Server is a simple JSON-RPC server.
type Server struct {
	logger        zerolog.Logger
	handlers      map[string]HandlerFunc
	notifications map[string]NotificationFunc
	inflight      sync.Map
}

// NewServer constructs a server instance.
func NewServer(logger zerolog.Logger) *Server {
	return &Server{
		logger:        logger,
		handlers:      make(map[string]HandlerFunc),
		notifications: make(map[string]NotificationFunc),
	}
}

// Register registers an RPC handler.
func (s *Server) Register(method string, handler HandlerFunc) {
	s.handlers[method] = handler
}

// RegisterNotification registers a notification handler.
func (s *Server) RegisterNotification(method string, handler NotificationFunc) {
	s.notifications[method] = handler
}

// Cancel cancels an in-flight request, if present.
func (s *Server) Cancel(requestID string) bool {
	if value, ok := s.inflight.Load(requestID); ok {
		if cancel, ok := value.(context.CancelFunc); ok {
			cancel()
			s.inflight.Delete(requestID)
			return true
		}
	}
	return false
}

// Serve starts processing incoming JSON-RPC messages.
func (s *Server) Serve(reader io.Reader, writer io.Writer) error {
	decoder := json.NewDecoder(reader)
	encoder := json.NewEncoder(writer)

	for {
		var req Request
		if err := decoder.Decode(&req); err != nil {
			if errors.Is(err, io.EOF) {
				return nil
			}
			s.logger.Error().Err(err).Msg("failed to decode JSON")
			return err
		}

		if req.ID == nil {
			if handler, ok := s.notifications[req.Method]; ok {
				go handler(context.Background(), req.Params)
			} else {
				s.logger.Warn().Str("method", req.Method).Msg("notification handler not found")
			}
			continue
		}

		handler, ok := s.handlers[req.Method]
		if !ok {
			resp := Response{
				JSONRPC: "2.0",
				ID:      req.ID,
				Error: &Error{
					Code:    -32601,
					Message: "method not found",
				},
			}
			if err := encoder.Encode(resp); err != nil {
				s.logger.Error().Err(err).Msg("failed to encode response")
			}
			continue
		}

		ctx, cancel := context.WithCancel(context.Background())
		var inflightKey string
		if key, ok := canonicalID(req.ID); ok {
			inflightKey = key
			s.inflight.Store(key, cancel)
		}

		result, rpcErr := handler(ctx, req.Params)

		cancel()
		if inflightKey != "" {
			s.inflight.Delete(inflightKey)
		}

		resp := Response{
			JSONRPC: "2.0",
			ID:      req.ID,
		}

		if rpcErr != nil {
			resp.Error = rpcErr
		} else {
			resp.Result = result
		}

		if err := encoder.Encode(resp); err != nil {
			s.logger.Error().Err(err).Msg("failed to encode response")
		}
	}
}

func canonicalID(raw *json.RawMessage) (string, bool) {
	if raw == nil {
		return "", false
	}

	var v interface{}
	if err := json.Unmarshal(*raw, &v); err != nil {
		return string(*raw), true
	}

	switch id := v.(type) {
	case float64:
		return fmt.Sprintf("%.0f", id), true
	case string:
		return id, true
	default:
		return fmt.Sprint(id), true
	}
}

