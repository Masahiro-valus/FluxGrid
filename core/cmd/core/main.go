package main

import (
	"flag"
	"os"

	"github.com/fluxgrid/core/internal/handlers"
	"github.com/fluxgrid/core/internal/logging"
	"github.com/fluxgrid/core/internal/rpc"
)

func main() {
	useStdio := flag.Bool("stdio", true, "JSON-RPCを標準入出力で提供します")
	flag.Parse()

	logger := logging.Configure()

	server := rpc.NewServer(logger)
	handlers.Register(server)

	if *useStdio {
		if err := server.Serve(os.Stdin, os.Stdout); err != nil {
			logger.Fatal().Err(err).Msg("サーバー停止")
		}
		return
	}

	logger.Fatal().Msg("現在は --stdio モードのみサポートしています")
}

