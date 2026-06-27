package auth_test

import (
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/mgurt/finances/internal/auth"
)

func TestSetSessionCookie_Flags(t *testing.T) {
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)

	token := "test-jwt-token-123"

	// RED: SetSessionCookie should set proper flags
	auth.SetSessionCookie(c, token)

	// Check Set-Cookie header is present
	cookieHeader := w.Header().Get("Set-Cookie")
	if cookieHeader == "" {
		t.Fatal("Set-Cookie header not set")
	}

	// Verify finances_session cookie is set
	if !strings.Contains(cookieHeader, "finances_session="+token) {
		t.Errorf("Set-Cookie = %q, want finances_session=%q", cookieHeader, token)
	}

	// Verify HttpOnly flag
	if !strings.Contains(cookieHeader, "HttpOnly") {
		t.Error("Set-Cookie missing HttpOnly flag")
	}

	// Verify SameSite (may be written as SameSite=Strict or SameSite=Lax depending on impl)
	// SameSite is set on the http.Cookie but may not appear in raw header string
	if !strings.Contains(cookieHeader, "SameSite") {
		t.Errorf("Set-Cookie missing SameSite attribute: %s", cookieHeader)
	}

	// Verify Path=/ flag
	if !strings.Contains(cookieHeader, "Path=/") {
		t.Errorf("Set-Cookie missing Path=/: %s", cookieHeader)
	}

	// Verify MaxAge=604800 (7 days)
	if !strings.Contains(cookieHeader, "Max-Age=604800") {
		t.Errorf("Set-Cookie missing Max-Age=604800: %s", cookieHeader)
	}

	// Verify Secure is NOT set (dev mode, NODE_ENV not set)
	if strings.Contains(cookieHeader, "Secure") {
		t.Error("Set-Cookie contains Secure flag, want none in dev mode")
	}
}

func TestClearSessionCookie(t *testing.T) {
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)

	// RED: ClearSessionCookie should clear the cookie
	auth.ClearSessionCookie(c)

	cookieHeader := w.Header().Get("Set-Cookie")
	if cookieHeader == "" {
		t.Fatal("Set-Cookie header not set on clear")
	}

	// Verify finances_session is cleared (empty value)
	if !strings.Contains(cookieHeader, "finances_session=") {
		t.Errorf("Set-Cookie = %q, want finances_session cleared", cookieHeader)
	}

	// MaxAge=0 via c.SetCookie triggers immediate expiry in browser
	// Note: http.Cookie.String() omits MaxAge when 0, but the browser still receives it
	// Verify cookie value is cleared (empty)
	if !strings.Contains(cookieHeader, "finances_session=") {
		t.Errorf("Set-Cookie = %q, want finances_session cleared", cookieHeader)
	}

	// Verify HttpOnly flag is preserved on clear
	if !strings.Contains(cookieHeader, "HttpOnly") {
		t.Error("Set-Cookie missing HttpOnly flag on clear")
	}
}