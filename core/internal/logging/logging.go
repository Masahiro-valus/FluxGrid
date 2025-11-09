package logging

import (
	"os"
	"sync"

	"github.com/rs/zerolog"
)

var (
	logger     zerolog.Logger
	initLogger sync.Once
)

// Configure はzerologのグローバル設定を初期化し、ロガーを返す。
func Configure() zerolog.Logger {
	initLogger.Do(func() {
		zerolog.TimeFieldFormat = zerolog.TimeFormatUnixMs
		logger = zerolog.New(os.Stderr).
			With().
			Timestamp().
			Str("component", "core").
			Logger()
	})

	return logger
}

// Logger は初期化済みのロガーを返す。
func Logger() zerolog.Logger {
	if logger.GetLevel() == zerolog.NoLevel {
		return Configure()
	}

	return logger
}

