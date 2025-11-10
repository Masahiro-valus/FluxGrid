package handlers

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/fluxgrid/core/internal/schema"
)

type stubSchemaService struct {
	listCalled bool
	ddlCalled  bool
	err        error
	listResp   schema.ListResponse
	ddlResp    string
	lastList   schema.ListRequest
	lastDDL    schema.DDLRequest
}

func (s *stubSchemaService) List(_ context.Context, _ schema.Conn, req schema.ListRequest) (schema.ListResponse, error) {
	s.listCalled = true
	s.lastList = req
	return s.listResp, s.err
}

func (s *stubSchemaService) GetDDL(_ context.Context, _ schema.Conn, req schema.DDLRequest) (string, error) {
	s.ddlCalled = true
	s.lastDDL = req
	return s.ddlResp, s.err
}

func TestSchemaListHandlerSuccess(t *testing.T) {
	svc := &stubSchemaService{
		listResp: schema.ListResponse{
			Schemas: []schema.Schema{
				{
					Name: "public",
					Tables: []schema.Table{
						{
							Name: "customers",
							Type: "table",
							Columns: []schema.Column{
								{Name: "id", DataType: "integer", NotNull: true},
							},
						},
					},
				},
			},
		},
	}

	handler := schemaListHandler(svc, connectionFactory(func(context.Context, string) (schema.Conn, func(), error) {
		return nil, func() {}, nil
	}))

	params := map[string]any{
		"connection": map[string]string{
			"driver": "postgres",
			"dsn":    "postgresql://example",
		},
		"options": map[string]any{
			"search": "",
		},
	}
	raw, _ := json.Marshal(params)
	result, rpcErr := handler(context.Background(), raw)
	if rpcErr != nil {
		t.Fatalf("handler returned rpc error: %v", rpcErr)
	}

	if !svc.listCalled {
		t.Fatalf("expected service List to be called")
	}

	response, ok := result.(schemaListResult)
	if !ok {
		t.Fatalf("unexpected response type %T", result)
	}

	if len(response.Schemas) != 1 {
		t.Fatalf("expected 1 schema, got %d", len(response.Schemas))
	}
}

func TestSchemaDDLHandlerMissingTarget(t *testing.T) {
	svc := &stubSchemaService{}
	handler := ddlGetHandler(svc, connectionFactory(func(context.Context, string) (schema.Conn, func(), error) {
		return nil, func() {}, nil
	}))

	params := map[string]any{
		"connection": map[string]string{
			"driver": "postgres",
			"dsn":    "postgresql://example",
		},
		"target": map[string]string{
			"schema": "public",
		},
	}

	raw, _ := json.Marshal(params)
	_, rpcErr := handler(context.Background(), raw)
	if rpcErr == nil {
		t.Fatalf("expected rpc error for missing name")
	}
}
