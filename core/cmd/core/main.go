package main

import (
	"flag"
	"os"

	"github.com/fluxgrid/core/internal/handlers"
	"github.com/fluxgrid/core/internal/logging"
	"github.com/fluxgrid/core/internal/rpc"
)

func main() {
	useStdio := flag.Bool("stdio", true, "Serve JSON-RPC over stdio")
	flag.Parse()

	logger := logging.Configure()

	server := rpc.NewServer(logger)
	handlers.Register(server)

	if *useStdio {
		if err := server.Serve(os.Stdin, os.Stdout); err != nil {
			logger.Fatal().Err(err).Msg("server stopped with error")
		}
		return
	}

	logger.Fatal().Msg("only --stdio mode is currently supported")
}

