package api_test

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/mgurt/finances/internal/api/testutil"
)

// TestRequireAuth_HTTP drives the full CORS -> AuthMiddleware -> RequireAuth
// -> handler chain that protected routes use. Cases: valid cookie unlocks
// the route, missing/expired/malformed/wrong-secret cookies all return 401.
func TestRequireAuth_HTTP(t *testing.T) {
	s := testutil.NewServer(t)
	goodCookie := s.Login(t)
	wrongSecretCookie := signTokenWithSecretHTTP(t, "wrong-secret", time.Now())
	expiredCookie := signExpiredTokenHTTP(t, s.Srv.JWTSecret)
	malformedCookie := "not.a.jwt"

	tests := []struct {
		name   string
		cookie string
		want   int
	}{
		{name: "valid cookie unlocks protected route", cookie: goodCookie, want: http.StatusOK},
		{name: "no cookie returns 401", cookie: "", want: http.StatusUnauthorized},
		{name: "expired JWT returns 401", cookie: expiredCookie, want: http.StatusUnauthorized},
		{name: "malformed JWT returns 401", cookie: malformedCookie, want: http.StatusUnauthorized},
		{name: "JWT signed with wrong secret returns 401", cookie: wrongSecretCookie, want: http.StatusUnauthorized},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/api/accounts", nil)
			if tt.cookie != "" {
				req.Header.Set("Cookie", "finances_session="+tt.cookie)
			}
			w := s.Do(req)
			if w.Code != tt.want {
				t.Errorf("status = %d, want %d (body: %s)", w.Code, tt.want, w.Body.String())
			}
		})
	}
}

// signTokenWithSecretHTTP mints a JWT with a custom signing secret. Used to
// produce a "valid shape, wrong secret" cookie for the requireAuth matrix.
func signTokenWithSecretHTTP(t *testing.T, secret string, issuedAt time.Time) string {
	t.Helper()
	claims := jwt.MapClaims{
		"iat": float64(issuedAt.Unix()),
		"exp": float64(issuedAt.Add(7 * 24 * time.Hour).Unix()),
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := tok.SignedString([]byte(secret))
	if err != nil {
		t.Fatalf("sign with custom secret: %v", err)
	}
	return signed
}

// signExpiredTokenHTTP mints a JWT whose exp is in the past. Uses the test
// server's secret so the failure mode is "expired", not "wrong secret".
func signExpiredTokenHTTP(t *testing.T, secret string) string {
	t.Helper()
	claims := jwt.MapClaims{
		"iat": float64(time.Now().Add(-48 * time.Hour).Unix()),
		"exp": float64(time.Now().Add(-1 * time.Hour).Unix()),
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := tok.SignedString([]byte(secret))
	if err != nil {
		t.Fatalf("sign expired token: %v", err)
	}
	return signed
}

// TestCORS_HTTP drives CORS at the HTTP boundary using the full production
// route table. Cases: no Origin header (browser same-origin request), an
// allowed Origin (echoed + credentials), a disallowed Origin (NOT echoed),
// and an OPTIONS preflight request (Allow-Methods + credentials).
func TestCORS_HTTP(t *testing.T) {
	s := testutil.NewServer(t)

	tests := []struct {
		name           string
		method         string
		origin         string
		requestMethod  string // for OPTIONS preflight
		wantACAO       string // empty = must NOT be set
		wantACAC       string // expected Access-Control-Allow-Credentials
		wantAllowMeths bool   // require Allow-Methods to be non-empty
	}{
		{
			name:   "no Origin header → no ACAO echoed",
			method: http.MethodGet,
			origin: "",
		},
		{
			name:     "allowed Origin (http://localhost:5173) → ACAO echoed + credentials",
			method:   http.MethodGet,
			origin:   "http://localhost:5173",
			wantACAO: "http://localhost:5173",
			wantACAC: "true",
		},
		{
			name:   "disallowed Origin (http://evil.example) → NOT echoed",
			method: http.MethodGet,
			origin: "http://evil.example",
		},
		{
			name:           "OPTIONS preflight for GET → ACAO echoed + Allow-Methods set + credentials",
			method:         http.MethodOptions,
			origin:         "http://localhost:5173",
			requestMethod:  "GET",
			wantACAO:       "http://localhost:5173",
			wantACAC:       "true",
			wantAllowMeths: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var req *http.Request
			if tt.method == http.MethodOptions {
				req = httptest.NewRequest(http.MethodOptions, "/api/accounts", nil)
			} else {
				req = httptest.NewRequest(http.MethodGet, "/api/accounts", nil)
			}
			if tt.origin != "" {
				req.Header.Set("Origin", tt.origin)
			}
			if tt.requestMethod != "" {
				req.Header.Set("Access-Control-Request-Method", tt.requestMethod)
			}
			w := s.Do(req)

			acao := w.Header().Get("Access-Control-Allow-Origin")
			acac := w.Header().Get("Access-Control-Allow-Credentials")
			allowMethods := w.Header().Get("Access-Control-Allow-Methods")

			if tt.wantACAO == "" {
				if acao != "" {
					t.Errorf("ACAO = %q, want empty (origin %q should not be echoed)", acao, tt.origin)
				}
			} else {
				if acao != tt.wantACAO {
					t.Errorf("ACAO = %q, want %q", acao, tt.wantACAO)
				}
			}
			if tt.wantACAC != "" && acac != tt.wantACAC {
				t.Errorf("ACAC = %q, want %q", acac, tt.wantACAC)
			}
			if tt.wantAllowMeths && allowMethods == "" {
				t.Error("Allow-Methods empty on preflight")
			}
		})
	}
}
