package handlers_test

import (
	"net/http"
	"testing"

	"github.com/mgurt/finances/internal/api/testutil"
	"github.com/mgurt/finances/internal/models"
)

// TestHealth_HTTP asserts GET /health returns 200 + JSON with the
// documented shape. The endpoint is public (no auth required).
func TestHealth_HTTP(t *testing.T) {
	s := testutil.NewServer(t)

	var resp models.HealthResponse
	w := s.DoJSON(t, http.MethodGet, "/health", nil, &resp)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 (body: %s)", w.Code, w.Body.String())
	}
	if resp.Status != "ok" {
		t.Errorf("status = %q, want ok", resp.Status)
	}
	if resp.Version == "" {
		t.Error("version is empty")
	}
	if resp.Timestamp == "" {
		t.Error("timestamp is empty")
	}
	if resp.Uptime == "" {
		t.Error("uptime is empty")
	}
}

// TestHealth_ContentType pins the Content-Type header on the response.
func TestHealth_ContentType(t *testing.T) {
	s := testutil.NewServer(t)

	w := s.DoJSON(t, http.MethodGet, "/health", nil, nil)

	ct := w.Header().Get("Content-Type")
	if ct == "" {
		t.Fatal("Content-Type header is empty")
	}
	// We expect application/json (or application/json; charset=...).
	if !contains(ct, "application/json") {
		t.Errorf("Content-Type = %q, want to contain application/json", ct)
	}
}

// contains is a small strings.Contains wrapper local to this file.
func contains(s, sub string) bool {
	if sub == "" {
		return true
	}
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}
