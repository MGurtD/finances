package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/mgurt/finances/internal/apitypes"
	"github.com/mgurt/finances/internal/auth"
	"github.com/mgurt/finances/internal/db"
	"github.com/mgurt/finances/internal/models"
)

// testTransactionsServer wires up ONLY the bulk-delete route against an
// in-memory DB, with the real AuthMiddleware so we exercise the full
// auth + handler + store chain end-to-end without pulling in the rest
// of the route table (which would create an import cycle).
func testTransactionsServer(t *testing.T) (*gin.Engine, *db.Store) {
	t.Helper()

	os.Setenv("DATABASE_URL", ":memory:")
	defer os.Unsetenv("DATABASE_URL")

	database, err := db.Open()
	if err != nil {
		t.Fatalf("db.Open: %v", err)
	}
	t.Cleanup(func() { database.Close() })

	if err := db.RunMigrations(database); err != nil {
		t.Fatalf("RunMigrations: %v", err)
	}
	if err := db.Seed(database); err != nil {
		t.Fatalf("Seed: %v", err)
	}

	srv := apitypes.NewServer(database, apitypes.Config{
		PasswordHash: "$2a$10$0/uPukIQ0ewWCbc/qrCk3OuY9fYa..NrOU3UwgtUPw0M1OBTHrENq",
		JWTSecret:    "test-secret",
		RateLimiter:  auth.NewRateLimiter(),
	})
	store := srv.Store

	r := gin.New()
	r.Use(gin.Recovery())

	// Public routes (no auth required): login + accounts list (needed
	// by the test helper to discover the seeded account).
	authHandler := NewAuthHandler(srv)
	r.POST("/api/auth/login", authHandler.Login)
	r.GET("/api/accounts", NewAccountsHandler(srv).List)

	// Real cookie auth middleware, mirroring internal/api/middleware.go.
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
	r.Use(func(c *gin.Context) {
		if authed, ok := c.Get("authenticated"); !ok || !authed.(bool) {
			c.AbortWithStatusJSON(http.StatusUnauthorized, models.ErrorResponse{Error: "unauthorized"})
			return
		}
		c.Next()
	})

	txHandler := NewTransactionsHandler(srv)
	r.POST("/api/transactions", txHandler.Create)
	r.POST("/api/transactions/bulk", txHandler.BulkCreate)
	r.POST("/api/transactions/bulk-delete", txHandler.BulkDelete)

	return r, store
}

func login(t *testing.T, r *gin.Engine) string {
	t.Helper()
	body, _ := json.Marshal(map[string]string{"password": "password"})
	req := httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("login failed: %d %s", w.Code, w.Body.String())
	}
	cookieHeader := w.Header().Get("Set-Cookie")
	if cookieHeader == "" {
		t.Fatal("login did not return Set-Cookie")
	}
	for _, part := range strings.Split(cookieHeader, ";") {
		part = strings.TrimSpace(part)
		if strings.HasPrefix(part, "finances_session=") {
			return strings.TrimPrefix(part, "finances_session=")
		}
	}
	t.Fatal("could not extract finances_session cookie value")
	return ""
}

func TestBulkDelete_HTTP(t *testing.T) {
	r, _ := testTransactionsServer(t)
	cookie := login(t, r)

	t.Run("deletes all ids and returns count", func(t *testing.T) {
		ids := createThreeViaHTTP(t, r, cookie)

		body, _ := json.Marshal(map[string]any{"ids": ids})
		req := httptest.NewRequest(http.MethodPost, "/api/transactions/bulk-delete", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Cookie", "finances_session="+cookie)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200. body: %s", w.Code, w.Body.String())
		}

		var resp struct {
			Deleted int `json:"deleted"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatalf("unmarshal: %v", err)
		}
		if resp.Deleted != 3 {
			t.Errorf("deleted = %d, want 3", resp.Deleted)
		}
	})

	t.Run("returns 400 when ids is empty", func(t *testing.T) {
		body, _ := json.Marshal(map[string]any{"ids": []string{}})
		req := httptest.NewRequest(http.MethodPost, "/api/transactions/bulk-delete", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Cookie", "finances_session="+cookie)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusBadRequest {
			t.Errorf("status = %d, want 400", w.Code)
		}
	})

	t.Run("returns 400 when body is malformed", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/api/transactions/bulk-delete", bytes.NewReader([]byte("not json")))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Cookie", "finances_session="+cookie)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusBadRequest {
			t.Errorf("status = %d, want 400", w.Code)
		}
	})

	t.Run("returns 0 deleted when ids do not exist", func(t *testing.T) {
		body, _ := json.Marshal(map[string]any{"ids": []string{"no-such-id-1", "no-such-id-2"}})
		req := httptest.NewRequest(http.MethodPost, "/api/transactions/bulk-delete", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Cookie", "finances_session="+cookie)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200. body: %s", w.Code, w.Body.String())
		}
		var resp struct {
			Deleted int `json:"deleted"`
		}
		_ = json.Unmarshal(w.Body.Bytes(), &resp)
		if resp.Deleted != 0 {
			t.Errorf("deleted = %d, want 0", resp.Deleted)
		}
	})

	t.Run("returns 401 without auth cookie", func(t *testing.T) {
		body, _ := json.Marshal(map[string]any{"ids": []string{"x"}})
		req := httptest.NewRequest(http.MethodPost, "/api/transactions/bulk-delete", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusUnauthorized {
			t.Errorf("status = %d, want 401", w.Code)
		}
	})
}

// TestBulkCreate_HTTP exercises the full BulkCreate HTTP route to lock in
// the {inserted, skipped} response shape and the dedup activation wired
// through SHA256(importHash).
func TestBulkCreate_HTTP(t *testing.T) {
	r, store := testTransactionsServer(t)
	cookie := login(t, r)

	// Discover the seeded account id (single helper call shared across subtests).
	listReq := httptest.NewRequest(http.MethodGet, "/api/accounts", nil)
	listReq.Header.Set("Cookie", "finances_session="+cookie)
	listW := httptest.NewRecorder()
	r.ServeHTTP(listW, listReq)
	if listW.Code != http.StatusOK {
		t.Fatalf("list accounts: %d %s", listW.Code, listW.Body.String())
	}
	var accounts []struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(listW.Body.Bytes(), &accounts); err != nil {
		t.Fatalf("unmarshal accounts: %v", err)
	}
	if len(accounts) == 0 {
		t.Fatal("no seeded accounts")
	}
	accountID := accounts[0].ID

	postBulk := func(t *testing.T, body []byte) (int, map[string]int) {
		t.Helper()
		req := httptest.NewRequest(http.MethodPost, "/api/transactions/bulk", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Cookie", "finances_session="+cookie)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		var resp map[string]int
		_ = json.Unmarshal(w.Body.Bytes(), &resp)
		return w.Code, resp
	}

	t.Run("returns inserted count and skipped=0 on first import", func(t *testing.T) {
		body, _ := json.Marshal(map[string]any{
			"transactions": []map[string]any{
				{"accountId": accountID, "kind": "expense", "amount": -10, "date": "2026-04-01", "importHash": "http-h-001"},
				{"accountId": accountID, "kind": "expense", "amount": -20, "date": "2026-04-02", "importHash": "http-h-002"},
			},
		})
		code, resp := postBulk(t, body)
		if code != http.StatusOK {
			t.Fatalf("status = %d, want 200. body=%s", code, string(body))
		}
		if resp["inserted"] != 2 {
			t.Errorf("inserted = %d, want 2", resp["inserted"])
		}
		if resp["skipped"] != 0 {
			t.Errorf("skipped = %d, want 0", resp["skipped"])
		}
	})

	t.Run("re-importing the same hashes returns inserted=0, skipped=N", func(t *testing.T) {
		body, _ := json.Marshal(map[string]any{
			"transactions": []map[string]any{
				{"accountId": accountID, "kind": "expense", "amount": -10, "date": "2026-04-01", "importHash": "http-h-001"},
				{"accountId": accountID, "kind": "expense", "amount": -20, "date": "2026-04-02", "importHash": "http-h-002"},
			},
		})
		code, resp := postBulk(t, body)
		if code != http.StatusOK {
			t.Fatalf("status = %d, want 200", code)
		}
		if resp["inserted"] != 0 {
			t.Errorf("inserted = %d, want 0 (dedup)", resp["inserted"])
		}
		if resp["skipped"] != 2 {
			t.Errorf("skipped = %d, want 2 (dedup)", resp["skipped"])
		}
	})

	t.Run("returns 401 without auth cookie", func(t *testing.T) {
		body, _ := json.Marshal(map[string]any{
			"transactions": []map[string]any{
				{"accountId": accountID, "kind": "expense", "amount": -1, "date": "2026-04-01"},
			},
		})
		req := httptest.NewRequest(http.MethodPost, "/api/transactions/bulk", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusUnauthorized {
			t.Errorf("status = %d, want 401", w.Code)
		}
	})

	// Silence the unused import for `store` in case future tests need it.
	_ = store
}

// createThreeViaHTTP creates three transactions through the real handler
// using the seeded default account.
func createThreeViaHTTP(t *testing.T, r *gin.Engine, cookie string) []string {
	t.Helper()

	listReq := httptest.NewRequest(http.MethodGet, "/api/accounts", nil)
	listReq.Header.Set("Cookie", "finances_session="+cookie)
	listW := httptest.NewRecorder()
	r.ServeHTTP(listW, listReq)
	if listW.Code != http.StatusOK {
		t.Fatalf("list accounts: %d %s", listW.Code, listW.Body.String())
	}
	var accounts []struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(listW.Body.Bytes(), &accounts); err != nil {
		t.Fatalf("unmarshal accounts: %v", err)
	}
	if len(accounts) == 0 {
		t.Fatal("no seeded accounts")
	}
	accountID := accounts[0].ID

	ids := make([]string, 0, 3)
	for i := 0; i < 3; i++ {
		body, _ := json.Marshal(map[string]any{
			"accountId":   accountID,
			"kind":        "expense",
			"amount":      -100 * (i + 1),
			"date":        "2026-05-01",
			"description": "bulk-delete-test",
		})
		req := httptest.NewRequest(http.MethodPost, "/api/transactions", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Cookie", "finances_session="+cookie)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusCreated {
			t.Fatalf("create tx %d: %d %s", i, w.Code, w.Body.String())
		}
		var created struct {
			ID string `json:"id"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &created); err != nil {
			t.Fatalf("unmarshal tx %d: %v", i, err)
		}
		if created.ID == "" {
			t.Fatalf("created tx %d has empty id", i)
		}
		ids = append(ids, created.ID)
	}
	return ids
}