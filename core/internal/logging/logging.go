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

// Configure wires zerolog defaults and returns the logger.
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

// Logger returns an initialized logger instance.
func Logger() zerolog.Logger {
	if logger.GetLevel() == zerolog.NoLevel {
		return Configure()
	}

	return logger
}

