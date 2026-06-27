package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/mgurt/finances/internal/apitypes"
	"github.com/mgurt/finances/internal/auth"
	"github.com/mgurt/finances/internal/models"
)

func init() {
	gin.SetMode(gin.TestMode)
}

// testAuthServer creates a test gin engine with auth routes for handler tests.
func testAuthServer(t *testing.T) *gin.Engine {
	r := gin.New()
	srv := &apitypes.Server{
		PasswordHash: "$2a$10$0/uPukIQ0ewWCbc/qrCk3OuY9fYa..NrOU3UwgtUPw0M1OBTHrENq",
		JWTSecret:    "test-secret",
		RateLimiter:  auth.NewRateLimiter(),
	}

	// Middleware that verifies JWT cookie and sets authenticated in context
	r.Use(func(c *gin.Context) {
		cookie, err := c.Cookie("finances_session")
		if err != nil || cookie == "" {
			c.Set("authenticated", false)
			c.Next()
			return
		}
		claims, err := auth.VerifyToken(cookie, srv.JWTSecret)
		if err != nil {
			c.Set("authenticated", false)
			c.Next()
			return
		}
		c.Set("authenticated", true)
		if iat, ok := claims["iat"].(float64); ok {
			c.Set("issuedAt", time.Unix(int64(iat), 0).Format(time.RFC3339))
		}
		c.Next()
	})

	authHandler := NewAuthHandler(srv)
	r.POST("/api/auth/login", authHandler.Login)
	r.POST("/api/auth/logout", authHandler.Logout)
	r.GET("/api/auth/status", authHandler.AuthStatus)
	return r
}

func TestLogin_Success(t *testing.T) {
	r := testAuthServer(t)

	body := models.LoginReq{Password: "password"}
	jsonBody, _ := json.Marshal(body)
	req := httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewReader(jsonBody))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp models.AuthStatusResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}
	if !resp.Authenticated {
		t.Error("expected authenticated=true")
	}

	if w.Header().Get("Set-Cookie") == "" {
		t.Error("expected Set-Cookie header")
	}
}

func TestLogin_WrongPassword(t *testing.T) {
	r := testAuthServer(t)

	body := map[string]string{"password": "wrongpassword"}
	jsonBody, _ := json.Marshal(body)
	req := httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewReader(jsonBody))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected status 401, got %d", w.Code)
	}

	var errResp models.ErrorResponse
	if err := json.Unmarshal(w.Body.Bytes(), &errResp); err != nil {
		t.Fatalf("failed to unmarshal error response: %v", err)
	}
	if errResp.Error == "" {
		t.Error("expected error message")
	}

	cookie := w.Header().Get("Set-Cookie")
	if strings.Contains(cookie, "finances_session") && !strings.Contains(cookie, "Max-Age=0") {
		t.Error("expected no session cookie on failed login")
	}
}

func TestLogin_MissingPassword(t *testing.T) {
	r := testAuthServer(t)

	body := map[string]string{}
	jsonBody, _ := json.Marshal(body)
	req := httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewReader(jsonBody))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected status 400, got %d: %s", w.Code, w.Body.String())
	}
}

func TestLogout(t *testing.T) {
	r := testAuthServer(t)

	req := httptest.NewRequest(http.MethodPost, "/api/auth/logout", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}

	cookie := w.Header().Get("Set-Cookie")
	if !strings.Contains(cookie, "finances_session") || !strings.Contains(cookie, "Max-Age=0") {
		t.Error("expected cookie to be cleared (Max-Age=0)")
	}
}

func TestAuthStatus_Unauthenticated(t *testing.T) {
	r := testAuthServer(t)

	req := httptest.NewRequest(http.MethodGet, "/api/auth/status", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}

	var resp models.AuthStatusResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}
	if resp.Authenticated {
		t.Error("expected authenticated=false with no cookie")
	}
}

func TestAuthStatus_Authenticated(t *testing.T) {
	r := testAuthServer(t)

	body := models.LoginReq{Password: "password"}
	jsonBody, _ := json.Marshal(body)
	loginReq := httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewReader(jsonBody))
	loginReq.Header.Set("Content-Type", "application/json")
	loginW := httptest.NewRecorder()
	r.ServeHTTP(loginW, loginReq)

	cookieHeader := loginW.Header().Get("Set-Cookie")
	if cookieHeader == "" {
		t.Fatal("login did not set a cookie")
	}

	cookieParts := strings.Split(cookieHeader, ";")
	cookieValue := strings.TrimSpace(strings.Split(cookieParts[0], "=")[1])

	statusReq := httptest.NewRequest(http.MethodGet, "/api/auth/status", nil)
	statusReq.Header.Set("Cookie", "finances_session="+cookieValue)
	statusW := httptest.NewRecorder()
	r.ServeHTTP(statusW, statusReq)

	if statusW.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", statusW.Code)
	}

	var resp models.AuthStatusResponse
	if err := json.Unmarshal(statusW.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}
	if !resp.Authenticated {
		t.Error("expected authenticated=true with valid token")
	}
}

func TestLogin_RateLimit(t *testing.T) {
	r := testAuthServer(t)

	wrongBody := map[string]string{"password": "wrong"}
	jsonBody, _ := json.Marshal(wrongBody)

	for i := 0; i < 5; i++ {
		req := httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewReader(jsonBody))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code == http.StatusTooManyRequests {
			return
		}
	}

	req := httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewReader(jsonBody))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusTooManyRequests {
		t.Errorf("expected status 429 after 5 failures, got %d: %s", w.Code, w.Body.String())
	}
}
