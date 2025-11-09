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
	// HandlerFunc はJSON-RPCリクエストを処理する関数。
	HandlerFunc func(ctx context.Context, params json.RawMessage) (any, *Error)

	// NotificationFunc はJSON-RPC通知を処理する関数。
	NotificationFunc func(ctx context.Context, params json.RawMessage)
)

// Error はJSON-RPCエラー表現。
type Error struct {
	Code    int         `json:"code"`
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
}

// Request はJSON-RPCリクエスト。
type Request struct {
	JSONRPC string          `json:"jsonrpc"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params,omitempty"`
	ID      *json.RawMessage `json:"id,omitempty"`
}

// Response はJSON-RPCレスポンス。
type Response struct {
	JSONRPC string       `json:"jsonrpc"`
	Result  interface{}  `json:"result,omitempty"`
	Error   *Error       `json:"error,omitempty"`
	ID      *json.RawMessage `json:"id,omitempty"`
}

// Server はJSON-RPCサーバー。
type Server struct {
	logger        zerolog.Logger
	handlers      map[string]HandlerFunc
	notifications map[string]NotificationFunc
	inflight      sync.Map
}

// NewServer はサーバーを初期化する。
func NewServer(logger zerolog.Logger) *Server {
	return &Server{
		logger:        logger,
		handlers:      make(map[string]HandlerFunc),
		notifications: make(map[string]NotificationFunc),
	}
}

// Register はリクエストハンドラーを登録する。
func (s *Server) Register(method string, handler HandlerFunc) {
	s.handlers[method] = handler
}

// RegisterNotification は通知ハンドラーを登録する。
func (s *Server) RegisterNotification(method string, handler NotificationFunc) {
	s.notifications[method] = handler
}

// Cancel は進行中のリクエストをキャンセルする。
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

// Serve はリクエストを受け付ける。
func (s *Server) Serve(reader io.Reader, writer io.Writer) error {
	decoder := json.NewDecoder(reader)
	encoder := json.NewEncoder(writer)

	for {
		var req Request
		if err := decoder.Decode(&req); err != nil {
			if errors.Is(err, io.EOF) {
				return nil
			}
			s.logger.Error().Err(err).Msg("JSONデコード失敗")
			return err
		}

		if req.ID == nil {
			if handler, ok := s.notifications[req.Method]; ok {
				go handler(context.Background(), req.Params)
			} else {
				s.logger.Warn().Str("method", req.Method).Msg("未登録の通知")
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
					Message: "未定義のメソッドです",
				},
			}
			if err := encoder.Encode(resp); err != nil {
				s.logger.Error().Err(err).Msg("レスポンス送信失敗")
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
			s.logger.Error().Err(err).Msg("レスポンス送信失敗")
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

