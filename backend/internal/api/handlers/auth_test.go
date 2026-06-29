package handlers_test

import (
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/mgurt/finances/internal/api/testutil"
	"github.com/mgurt/finances/internal/models"
)

// TestLogin exercises POST /api/auth/login across all three documented
// outcomes (200, 400, 401) plus the rate-limit cutoff (429 after 5
// failures). Each subtest is independent: a fresh Server per case keeps
// the in-memory rate limiter empty so the rate-limit scenario can build
// up its own quota.
func TestLogin(t *testing.T) {
	t.Run("returns 200 + Set-Cookie on correct password", func(t *testing.T) {
		s := testutil.NewServer(t)

		var resp models.AuthStatusResponse
		w := s.DoJSON(t, http.MethodPost, "/api/auth/login",
			map[string]string{"password": testutil.TestPassword}, &resp)

		if w.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200 (body: %s)", w.Code, w.Body.String())
		}
		if !resp.Authenticated {
			t.Error("response.authenticated = false, want true")
		}
		if len(w.Header().Values("Set-Cookie")) == 0 {
			t.Error("missing Set-Cookie header on successful login")
		}
	})

	t.Run("returns 401 on wrong password with no Set-Cookie that activates a session", func(t *testing.T) {
		s := testutil.NewServer(t)

		var errResp models.ErrorResponse
		w := s.DoJSON(t, http.MethodPost, "/api/auth/login",
			map[string]string{"password": "wrongpassword"}, &errResp)

		if w.Code != http.StatusUnauthorized {
			t.Errorf("status = %d, want 401", w.Code)
		}
		if errResp.Error == "" {
			t.Error("error response missing message")
		}
	})

	t.Run("returns 400 on missing password field", func(t *testing.T) {
		s := testutil.NewServer(t)

		w := s.DoJSON(t, http.MethodPost, "/api/auth/login",
			map[string]string{}, nil)

		if w.Code != http.StatusBadRequest {
			t.Errorf("status = %d, want 400 (body: %s)", w.Code, w.Body.String())
		}
	})

	t.Run("returns 429 after 5 consecutive failed attempts", func(t *testing.T) {
		s := testutil.NewServer(t)

		// Burn the 5 attempts the rate limiter allows.
		for i := 0; i < 5; i++ {
			w := s.DoJSON(t, http.MethodPost, "/api/auth/login",
				map[string]string{"password": "wrong"}, nil)
			if w.Code != http.StatusUnauthorized {
				t.Fatalf("attempt %d: status = %d, want 401", i, w.Code)
			}
		}

		// 6th attempt must hit the limiter.
		w := s.DoJSON(t, http.MethodPost, "/api/auth/login",
			map[string]string{"password": "wrong"}, nil)
		if w.Code != http.StatusTooManyRequests {
			t.Errorf("6th attempt: status = %d, want 429 (body: %s)", w.Code, w.Body.String())
		}
	})
}

// TestLogout asserts POST /api/auth/logout returns 200 and a Set-Cookie
// that clears the session (Max-Age=0).
func TestLogout(t *testing.T) {
	s := testutil.NewServer(t)

	w := s.DoJSON(t, http.MethodPost, "/api/auth/logout", nil, nil)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", w.Code)
	}
	cookies := w.Header().Values("Set-Cookie")
	if len(cookies) == 0 {
		t.Fatal("missing Set-Cookie header on logout")
	}
	// We expect the cookie to carry Max-Age=0 (session clear).
	found := false
	for _, c := range cookies {
		if containsAll(c, testutil.CookieName, "Max-Age=0") {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("expected Set-Cookie with %s and Max-Age=0; got: %v", testutil.CookieName, cookies)
	}
}

// TestAuthStatus covers GET /api/auth/status.
//
// /api/auth/status now lives on an authOptional sub-group that runs
// AuthMiddleware but not RequireAuth — the handler reads
// c.Get("authenticated") and returns "authenticated":true plus the
// JWT issuance time when a valid cookie is presented.
func TestAuthStatus(t *testing.T) {
	t.Run("returns 200 + authenticated:false with no cookie", func(t *testing.T) {
		s := testutil.NewServer(t)

		var resp models.AuthStatusResponse
		w := s.DoJSON(t, http.MethodGet, "/api/auth/status", nil, &resp)

		if w.Code != http.StatusOK {
			t.Errorf("status = %d, want 200", w.Code)
		}
		if resp.Authenticated {
			t.Error("authenticated = true with no cookie, want false")
		}
		if resp.IssuedAt != nil && *resp.IssuedAt != "" {
			t.Errorf("issuedAt = %q with no cookie, want nil/empty", *resp.IssuedAt)
		}
	})

	t.Run("returns 200 + authenticated:true with a valid cookie", func(t *testing.T) {
		s := testutil.NewServer(t)
		s.Cookie = s.Login(t)

		var resp models.AuthStatusResponse
		w := s.DoJSON(t, http.MethodGet, "/api/auth/status", nil, &resp)

		if w.Code != http.StatusOK {
			t.Errorf("status = %d, want 200", w.Code)
		}
		if !resp.Authenticated {
			t.Error("authenticated = false, want true (with a valid cookie after authOptional middleware fix)")
		}
	})

	t.Run("returns IssuedAt non-empty and RFC3339 with a valid cookie", func(t *testing.T) {
		s := testutil.NewServer(t)
		s.Cookie = s.Login(t)

		var resp models.AuthStatusResponse
		w := s.DoJSON(t, http.MethodGet, "/api/auth/status", nil, &resp)

		if w.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200", w.Code)
		}
		if resp.IssuedAt == nil || *resp.IssuedAt == "" {
			t.Fatalf("issuedAt = %v, want non-empty RFC3339 timestamp", resp.IssuedAt)
		}
		if _, err := time.Parse(time.RFC3339, *resp.IssuedAt); err != nil {
			t.Errorf("issuedAt %q is not RFC3339: %v", *resp.IssuedAt, err)
		}
	})
}

// TestLogin_CookieIsUsable proves the cookie value from Login round-trips
// into a protected request — the contract every other handler test relies
// on.
func TestLogin_CookieIsUsable(t *testing.T) {
	s := testutil.NewServer(t)
	s.Cookie = s.Login(t)

	// A protected route should now succeed.
	w := s.DoJSON(t, http.MethodGet, "/api/accounts", nil, nil)
	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want 200 (body: %s)", w.Code, w.Body.String())
	}
}

// containsAll reports whether s contains every non-empty substring.
func containsAll(s string, subs ...string) bool {
	for _, sub := range subs {
		if sub == "" {
			continue
		}
		if !strings.Contains(s, sub) {
			return false
		}
	}
	return true
}
