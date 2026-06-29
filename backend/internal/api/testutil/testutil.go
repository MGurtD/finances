// Package testutil provides a shared HTTP test harness for the finances API.
//
// The testutil package wires a real *gin.Engine with the full route table from
// api.RegisterRoutes, an in-memory SQLite database with migrations and seed
// applied, and a real *apitypes.Server with deterministic bcrypt hash and JWT
// secret. It exposes Login to obtain a finances_session cookie value (parsed
// via http.Response.Cookies, never by splitting the raw Set-Cookie header),
// and DoJSON to issue requests with optional auth and JSON decoding.
//
// The harness is the single source of truth for handler test setup. No test
// file may re-declare the cookie-auth closure, the inlined db.Open +
// RunMigrations + Seed sequence, or hand-rolled gin.Engines.
package testutil

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/mgurt/finances/internal/api"
	"github.com/mgurt/finances/internal/apitypes"
	"github.com/mgurt/finances/internal/auth"
	"github.com/mgurt/finances/internal/db"
)

// Canonical test credentials and identifiers. The bcrypt hash is the one the
// repo uses elsewhere for development; any plaintext that matches it (the
// production password) will succeed.
const (
	// TestPassword is the plaintext that satisfies TestBcryptHash.
	TestPassword = "password"
	// TestBcryptHash is the bcrypt hash of TestPassword (cost 10).
	TestBcryptHash = "$2a$10$0/uPukIQ0ewWCbc/qrCk3OuY9fYa..NrOU3UwgtUPw0M1OBTHrENq"
	// TestJWTSecret is the fixed signing secret used by the test server.
	TestJWTSecret = "test-secret"
	// CookieName is the session cookie name. Must match the one used by
	// api.AuthMiddleware and auth.SetSessionCookie.
	CookieName = "finances_session"
)

// Options configures a test Server. The zero value is the recommended
// default: full route table, seeded DB, default CORS origin, fixed JWT
// secret. Override individual fields with the With* options.
type Options struct {
	// Routes controls whether to mount the full route table (true) or only
	// the public auth routes (false). Default: true.
	Routes bool
	// Seeded controls whether db.Seed is applied. Default: true.
	Seeded bool
	// CORSOrigin overrides the CORS_ORIGIN env var for this test. Empty
	// leaves the env var untouched (the middleware falls back to its
	// default of http://localhost:5173).
	CORSOrigin string
	// JWTSecret overrides the JWT signing secret. Default: TestJWTSecret.
	JWTSecret string
	// PasswordHash overrides the bcrypt hash used by the auth.Login flow.
	// Default: TestBcryptHash. Tests that want to exercise wrong-password
	// paths can leave it set; the Login helper always posts the right
	// password, so a custom hash breaks Login.
	PasswordHash string
}

// Option is a functional option for NewServer.
type Option func(*Options)

// WithRoutes enables or disables mounting the full route table.
// Pass false to mount only the public auth routes.
func WithRoutes(enabled bool) Option {
	return func(o *Options) { o.Routes = enabled }
}

// WithSeeded enables or disables the db.Seed step.
func WithSeeded(enabled bool) Option {
	return func(o *Options) { o.Seeded = enabled }
}

// WithCORSOrigin sets the CORS_ORIGIN env var for this test. The middleware
// reads it at registration time, so this must be set before api.RegisterRoutes
// is called. NewServer sets it via t.Setenv so it auto-cleans on test end.
func WithCORSOrigin(origin string) Option {
	return func(o *Options) { o.CORSOrigin = origin }
}

// WithJWTSecret overrides the JWT signing secret. Useful for middleware tests
// that need to forge expired or invalid tokens.
func WithJWTSecret(secret string) Option {
	return func(o *Options) { o.JWTSecret = secret }
}

// WithPasswordHash overrides the bcrypt password hash. Tests that want to
// exercise the wrong-password path can set a different hash, but then
// Server.Login will fail and tests should not call it.
func WithPasswordHash(hash string) Option {
	return func(o *Options) { o.PasswordHash = hash }
}

// Server is a test harness. Use NewServer to build one. Cookie is the value
// of the finances_session cookie for subsequent requests — set it after
// Login to authenticate those requests. Tests must not access Engine,
// Srv, or Store directly except where strictly necessary; prefer the helpers
// (Login, DoJSON, SeededAccountID, etc.) so the contract stays consistent.
type Server struct {
	Engine *gin.Engine
	Srv    *apitypes.Server
	Store  *db.Store
	// Cookie is the finances_session cookie value to attach to subsequent
	// requests issued by DoJSON and Do. Set it via Login or directly for
	// forged-token tests. Leave empty to issue guest requests.
	Cookie string

	opts Options
}

// NewServer builds a gin.Engine wired with the full route table from
// api.RegisterRoutes, an in-memory SQLite DB with migrations and seed
// applied, and a real *apitypes.Server. Registers t.Cleanup to close the DB
// and reset the CORS_ORIGIN env var. Returns a *Server that can be used
// to issue requests.
//
// The same CORS middleware, AuthMiddleware, and RequireAuth used in
// production are mounted, so the full CORS -> auth -> handler chain is
// exercised by every request. No option may bypass these middlewares.
func NewServer(t *testing.T, opts ...Option) *Server {
	t.Helper()

	o := Options{
		Routes:       true,
		Seeded:       true,
		JWTSecret:    TestJWTSecret,
		PasswordHash: TestBcryptHash,
	}
	for _, opt := range opts {
		opt(&o)
	}

	// CORS_ORIGIN is read by the middleware at registration time. Set it
	// via t.Setenv so the test's environment state is reset on test end.
	// If CORSOrigin is empty, we leave the env alone (or unset it) so the
	// middleware falls back to its default.
	if o.CORSOrigin != "" {
		t.Setenv("CORS_ORIGIN", o.CORSOrigin)
	} else {
		// t.Setenv to "" is fine; it records the previous value and
		// restores it. We also explicitly unsetenv in case t.Setenv
		// would otherwise keep the existing value around.
		t.Setenv("CORS_ORIGIN", "")
		_ = os.Unsetenv("CORS_ORIGIN")
	}

	// In-memory SQLite. The driver ignores :memory: and uses a per-conn
	// DB, but the package wraps it to share across connections.
	t.Setenv("DATABASE_URL", ":memory:")

	database, err := db.Open()
	if err != nil {
		t.Fatalf("db.Open: %v", err)
	}
	t.Cleanup(func() { database.Close() })

	if err := db.RunMigrations(database); err != nil {
		t.Fatalf("db.RunMigrations: %v", err)
	}
	if o.Seeded {
		if err := db.Seed(database); err != nil {
			t.Fatalf("db.Seed: %v", err)
		}
	}

	srv := apitypes.NewServer(database, apitypes.Config{
		PasswordHash: o.PasswordHash,
		JWTSecret:    o.JWTSecret,
		RateLimiter:  auth.NewRateLimiter(),
	})

	gin.SetMode(gin.TestMode)
	r := gin.New()
	if o.Routes {
		api.RegisterRoutes(r, srv)
	} else {
		api.RegisterAuthRoutes(r, srv)
	}

	return &Server{
		Engine: r,
		Srv:    srv,
		Store:  srv.Store,
		opts:   o,
	}
}

// Login posts to /api/auth/login with the canonical test password and
// returns the finances_session cookie value parsed via http.Response.Cookies.
// Does not store the value on Server — callers should assign it to
// Server.Cookie if subsequent requests should be authenticated.
//
// Fails the test if the login does not return 200 or no cookie is set.
func (s *Server) Login(t *testing.T) string {
	t.Helper()
	body, _ := json.Marshal(map[string]string{"password": TestPassword})
	req := httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	s.Engine.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("login failed: %d %s", w.Code, w.Body.String())
	}
	// Parse cookies via http.Response.Cookies() — robust against any
	// quoting or whitespace in the raw Set-Cookie header. Forbidden: any
	// string split on the raw Set-Cookie value.
	resp := w.Result()
	defer resp.Body.Close()
	for _, c := range resp.Cookies() {
		if c.Name == CookieName {
			return c.Value
		}
	}
	t.Fatal("login did not return a finances_session cookie")
	return ""
}

// DoJSON issues an HTTP request against the test engine. It sets the
// Content-Type header to application/json when body is non-nil, attaches
// the finances_session cookie when Server.Cookie is non-empty, and decodes
// the response body into out (if non-nil and the body is non-empty).
//
// Use nil for out when you want to assert on the raw *httptest.ResponseRecorder.
// Use nil for body for GET / DELETE requests.
//
// For tests that need custom headers (Origin for CORS) or non-JSON bodies,
// use Do instead.
func (s *Server) DoJSON(t *testing.T, method, path string, body any, out any) *httptest.ResponseRecorder {
	t.Helper()
	var reader io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			t.Fatalf("marshal body: %v", err)
		}
		reader = bytes.NewReader(b)
	} else {
		reader = bytes.NewReader(nil)
	}
	req := httptest.NewRequest(method, path, reader)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if s.Cookie != "" {
		req.Header.Set("Cookie", CookieName+"="+s.Cookie)
	}
	w := httptest.NewRecorder()
	s.Engine.ServeHTTP(w, req)
	if out != nil && w.Body.Len() > 0 {
		if err := json.Unmarshal(w.Body.Bytes(), out); err != nil {
			t.Fatalf("unmarshal response: %v (body: %s)", err, w.Body.String())
		}
	}
	return w
}

// Do issues a raw HTTP request. The caller controls all headers, the body,
// and the cookie. Use this for tests that need to set Origin (CORS), send
// non-JSON bodies, or forge tokens.
func (s *Server) Do(req *http.Request) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	s.Engine.ServeHTTP(w, req)
	return w
}

// SeededAccountID returns the ID of the seeded default account. It panics
// with t.Fatal if the Seeded option was not enabled (no default account
// exists).
func (s *Server) SeededAccountID(t *testing.T) string {
	t.Helper()
	if !s.opts.Seeded {
		t.Fatal("Seeded option was not enabled; no default account available")
	}
	return "00000000-0000-0000-0000-000000000001"
}

// SeededCategoryID returns the ID of a seeded category by name. The lookup
// is case-sensitive and excludes archived rows. Panics with t.Fatal if
// Seeded was not enabled or the category is not found.
func (s *Server) SeededCategoryID(t *testing.T, name string) string {
	t.Helper()
	if !s.opts.Seeded {
		t.Fatal("Seeded option was not enabled; no default categories available")
	}
	var id string
	err := s.Store.DB.QueryRow(
		`SELECT id FROM categories WHERE name = ? AND archived = 0`, name,
	).Scan(&id)
	if err != nil {
		t.Fatalf("seeded category %q not found: %v", name, err)
	}
	return id
}
