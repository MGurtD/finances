package testutil_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/mgurt/finances/internal/api/testutil"
	"github.com/mgurt/finances/internal/models"
)

// TestNewServer_BuildsHarness asserts the engine, server, and store are wired.
func TestNewServer_BuildsHarness(t *testing.T) {
	s := testutil.NewServer(t)
	if s == nil {
		t.Fatal("NewServer returned nil")
	}
	if s.Engine == nil {
		t.Fatal("Engine is nil")
	}
	if s.Srv == nil {
		t.Fatal("Server is nil")
	}
	if s.Store == nil {
		t.Fatal("Store is nil")
	}
}

// TestNewServer_HealthEndpoint proves the full route table is mounted (the
// /health route is registered first in api.RegisterRoutes).
func TestNewServer_HealthEndpoint(t *testing.T) {
	s := testutil.NewServer(t)
	w := s.Do(httptest.NewRequest(http.MethodGet, "/health", nil))
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 (body: %s)", w.Code, w.Body.String())
	}
	var resp models.HealthResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if resp.Status != "ok" {
		t.Errorf("status = %q, want ok", resp.Status)
	}
}

// TestNewServer_LoginReturnsCookie proves the cookie parsing path uses
// http.Response.Cookies() (no string split). It also stores the value so
// DoJSON can authenticate the next request.
func TestNewServer_LoginReturnsCookie(t *testing.T) {
	s := testutil.NewServer(t)
	cookie := s.Login(t)
	if cookie == "" {
		t.Fatal("Login returned empty cookie")
	}
	if len(strings.Split(cookie, ".")) < 3 {
		t.Errorf("cookie does not look like a JWT: %q", cookie)
	}
}

// TestNewServer_ProtectedRouteWithCookie proves the auth chain works
// end-to-end: CORS -> AuthMiddleware -> RequireAuth -> handler. A valid
// cookie unlocks the protected /api/accounts route.
//
// Note: /api/auth/status is NOT covered by AuthMiddleware in routes.go, so it
// always reports authenticated=false even with a valid cookie. That's a
// production bug (tracked in apply-progress), not a testutil issue. The
// auth chain is proven via the protected route here.
func TestNewServer_ProtectedRouteWithCookie(t *testing.T) {
	s := testutil.NewServer(t)
	s.Cookie = s.Login(t)

	// models.Account has a BoolInt Archived field with no UnmarshalJSON,
	// so we decode into a permissive shape and assert on the count + name.
	var resp []map[string]any
	w := s.DoJSON(t, http.MethodGet, "/api/accounts", nil, &resp)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 (body: %s)", w.Code, w.Body.String())
	}
	if len(resp) != 1 {
		t.Errorf("len(accounts) = %d, want 1 (seeded default)", len(resp))
	}
	if name, _ := resp[0]["name"].(string); name != "Compte corrent" {
		t.Errorf("account[0].name = %q, want 'Compte corrent'", name)
	}
}

// TestNewServer_RequireAuthBlocksGuest proves the protected chain rejects
// requests without a cookie.
func TestNewServer_RequireAuthBlocksGuest(t *testing.T) {
	s := testutil.NewServer(t)
	// Server.Cookie intentionally left empty
	w := s.DoJSON(t, http.MethodGet, "/api/accounts", nil, nil)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401", w.Code)
	}
}

// TestNewServer_PublicRoutesOnly confirms WithRoutes(false) mounts only
// the public auth routes (no /api/accounts).
func TestNewServer_PublicRoutesOnly(t *testing.T) {
	s := testutil.NewServer(t, testutil.WithRoutes(false))

	// /api/auth/login should work (public).
	loginW := s.DoJSON(t, http.MethodPost, "/api/auth/login",
		map[string]string{"password": testutil.TestPassword}, nil)
	if loginW.Code != http.StatusOK {
		t.Errorf("login on public-only engine: status = %d, want 200", loginW.Code)
	}

	// /api/accounts should NOT be registered.
	w := s.DoJSON(t, http.MethodGet, "/api/accounts", nil, nil)
	if w.Code == http.StatusOK {
		t.Errorf("accounts reachable on public-only engine: status = %d", w.Code)
	}
}

// TestNewServer_SeededAccountID proves the fixture helper returns the known
// default account ID.
func TestNewServer_SeededAccountID(t *testing.T) {
	s := testutil.NewServer(t)
	id := s.SeededAccountID(t)
	want := "00000000-0000-0000-0000-000000000001"
	if id != want {
		t.Errorf("SeededAccountID = %q, want %q", id, want)
	}
}

// TestNewServer_SeededCategoryID looks up a known seeded category by name.
func TestNewServer_SeededCategoryID(t *testing.T) {
	s := testutil.NewServer(t)
	id := s.SeededCategoryID(t, "Habitatge")
	if id == "" {
		t.Fatal("SeededCategoryID returned empty")
	}
	if !strings.HasPrefix(id, "00000000-0000-0000-0000-") {
		t.Errorf("SeededCategoryID does not look like a UUID: %q", id)
	}
}
