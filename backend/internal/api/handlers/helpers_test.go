package handlers_test

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/mgurt/finances/internal/api/testutil"
)

// newJSONRequest builds an *http.Request with a raw body, Content-Type
// application/json, and the given cookie. Use this when DoJSON's
// marshaling layer would t.Fatalf on a non-marshalable body — for example
// when testing the 400-malformed-JSON path of ShouldBindJSON.
func newJSONRequest(t *testing.T, method, path, body, cookie string) *http.Request {
	t.Helper()
	req := httptest.NewRequest(method, path, bytes.NewReader([]byte(body)))
	req.Header.Set("Content-Type", "application/json")
	if cookie != "" {
		req.Header.Set("Cookie", testutil.CookieName+"="+cookie)
	}
	return req
}
