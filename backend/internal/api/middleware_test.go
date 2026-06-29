package api

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/mgurt/finances/internal/apitypes"
)

func init() {
	gin.SetMode(gin.TestMode)
}

// --- AuthMiddleware unit tests (existing) --------------------------------

func TestAuthMiddleware_NoCookie(t *testing.T) {
	r := gin.New()
	srv := &apitypes.Server{JWTSecret: "test-secret"}
	r.Use(AuthMiddleware(srv))
	r.GET("/protected", func(c *gin.Context) {
		authenticated, exists := c.Get("authenticated")
		if !exists {
			c.JSON(200, gin.H{"authenticated": false})
			return
		}
		c.JSON(200, gin.H{"authenticated": authenticated})
	})

	req := httptest.NewRequest(http.MethodGet, "/protected", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}
	body := strings.TrimSpace(w.Body.String())
	if body != `{"authenticated":false}` {
		t.Errorf("expected authenticated=false, got %s", body)
	}
}

func TestAuthMiddleware_InvalidCookie(t *testing.T) {
	r := gin.New()
	srv := &apitypes.Server{JWTSecret: "test-secret"}
	r.Use(AuthMiddleware(srv))
	r.GET("/protected", func(c *gin.Context) {
		authenticated, _ := c.Get("authenticated")
		c.JSON(200, gin.H{"authenticated": authenticated})
	})

	req := httptest.NewRequest(http.MethodGet, "/protected", nil)
	req.Header.Set("Cookie", "finances_session=invalid.token.here")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}
	body := strings.TrimSpace(w.Body.String())
	if body != `{"authenticated":false}` {
		t.Errorf("expected authenticated=false, got %s", body)
	}
}

func TestAuthMiddleware_ValidCookie(t *testing.T) {
	r := gin.New()
	srv := &apitypes.Server{JWTSecret: "test-secret"}
	r.Use(AuthMiddleware(srv))

	gotAuthenticated := false
	r.GET("/protected", func(c *gin.Context) {
		authenticated, exists := c.Get("authenticated")
		if exists {
			gotAuthenticated = authenticated.(bool)
		}
		c.JSON(200, gin.H{"ok": true})
	})

	// Create a valid token
	issuedAt := time.Now()
	token, err := signTestToken("test-secret", issuedAt)
	if err != nil {
		t.Fatalf("failed to create test token: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/protected", nil)
	req.Header.Set("Cookie", "finances_session="+token)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}
	if !gotAuthenticated {
		t.Error("expected authenticated=true in context")
	}
}

func TestAuthMiddleware_ExpiredToken(t *testing.T) {
	r := gin.New()
	srv := &apitypes.Server{JWTSecret: "test-secret"}
	r.Use(AuthMiddleware(srv))
	r.GET("/protected", func(c *gin.Context) {
		authenticated, _ := c.Get("authenticated")
		c.JSON(200, gin.H{"authenticated": authenticated})
	})

	// Create a truly expired token with past exp
	expiredClaims := jwt.MapClaims{
		"iat": float64(time.Now().Add(-48 * time.Hour).Unix()),
		"exp": float64(time.Now().Add(-1 * time.Hour).Unix()), // expired 1h ago
	}
	expiredToken := jwt.NewWithClaims(jwt.SigningMethodHS256, expiredClaims)
	tokenStr, err := expiredToken.SignedString([]byte("test-secret"))
	if err != nil {
		t.Fatalf("failed to create expired token: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/protected", nil)
	req.Header.Set("Cookie", "finances_session="+tokenStr)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}
	body := strings.TrimSpace(w.Body.String())
	if body != `{"authenticated":false}` {
		t.Errorf("expected authenticated=false for expired token, got %s", body)
	}
}

// signTestToken creates a JWT token with iat and exp for testing.
func signTestToken(secret string, issuedAt time.Time) (string, error) {
	claims := jwt.MapClaims{
		"iat": float64(issuedAt.Unix()),
		"exp": float64(issuedAt.Add(7 * 24 * time.Hour).Unix()),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(secret))
}

// --- RequestLogger & Recovery (existing) ---------------------------------

func TestRequestLogger_Middleware(t *testing.T) {
	r := gin.New()
	r.Use(RequestLogger())
	r.GET("/test", func(c *gin.Context) {
		c.JSON(200, gin.H{"ok": true})
	})

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}
}

func TestRecovery_Middleware(t *testing.T) {
	r := gin.New()
	r.Use(Recovery())
	r.GET("/panic", func(c *gin.Context) {
		panic("test panic")
	})

	req := httptest.NewRequest(http.MethodGet, "/panic", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Errorf("expected status 500, got %d", w.Code)
	}
	body := strings.TrimSpace(w.Body.String())
	if body != `{"error":"internal server error"}` {
		t.Errorf("expected error JSON, got %s", body)
	}
}
