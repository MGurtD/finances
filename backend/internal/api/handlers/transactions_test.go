package handlers_test

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/mgurt/finances/internal/api/testutil"
	"github.com/mgurt/finances/internal/models"
)

// TestBulkDelete_HTTP exercises the full POST /api/transactions/bulk-delete
// route to lock in the {deleted} response shape.
func TestBulkDelete_HTTP(t *testing.T) {
	s := testutil.NewServer(t)
	s.Cookie = s.Login(t)
	accountID := s.SeededAccountID(t)

	createThree := func(t *testing.T) []string {
		t.Helper()
		ids := make([]string, 0, 3)
		for i := 0; i < 3; i++ {
			var created struct {
				ID string `json:"id"`
			}
			w := s.DoJSON(t, http.MethodPost, "/api/transactions", map[string]any{
				"accountId":   accountID,
				"kind":        "expense",
				"amount":      -100 * (i + 1),
				"date":        "2026-05-01",
				"description": "bulk-delete-test",
			}, &created)
			if w.Code != http.StatusCreated {
				t.Fatalf("create tx %d: %d %s", i, w.Code, w.Body.String())
			}
			if created.ID == "" {
				t.Fatalf("create tx %d returned empty id", i)
			}
			ids = append(ids, created.ID)
		}
		return ids
	}

	t.Run("deletes all ids and returns count", func(t *testing.T) {
		ids := createThree(t)

		var resp models.BulkDeleteResult
		w := s.DoJSON(t, http.MethodPost, "/api/transactions/bulk-delete",
			map[string]any{"ids": ids}, &resp)

		if w.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200 (body: %s)", w.Code, w.Body.String())
		}
		if resp.Deleted != 3 {
			t.Errorf("deleted = %d, want 3", resp.Deleted)
		}
	})

	t.Run("returns 400 when ids is empty", func(t *testing.T) {
		w := s.DoJSON(t, http.MethodPost, "/api/transactions/bulk-delete",
			map[string]any{"ids": []string{}}, nil)
		if w.Code != http.StatusBadRequest {
			t.Errorf("status = %d, want 400 (body: %s)", w.Code, w.Body.String())
		}
	})

	t.Run("returns 400 when body is malformed", func(t *testing.T) {
		// Bypass the JSON helper to send a non-JSON body.
		req := httptest.NewRequest(http.MethodPost, "/api/transactions/bulk-delete",
			bytes.NewReader([]byte("not json")))
		req.Header.Set("Content-Type", "application/json")
		if s.Cookie != "" {
			req.Header.Set("Cookie", testutil.CookieName+"="+s.Cookie)
		}
		w := s.Do(req)
		if w.Code != http.StatusBadRequest {
			t.Errorf("status = %d, want 400", w.Code)
		}
	})

	t.Run("returns 0 deleted when ids do not exist", func(t *testing.T) {
		var resp models.BulkDeleteResult
		w := s.DoJSON(t, http.MethodPost, "/api/transactions/bulk-delete",
			map[string]any{"ids": []string{"no-such-id-1", "no-such-id-2"}}, &resp)
		if w.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200 (body: %s)", w.Code, w.Body.String())
		}
		if resp.Deleted != 0 {
			t.Errorf("deleted = %d, want 0", resp.Deleted)
		}
	})

	t.Run("returns 401 without auth cookie", func(t *testing.T) {
		// Build a fresh server with no cookie.
		s2 := testutil.NewServer(t)
		w := s2.DoJSON(t, http.MethodPost, "/api/transactions/bulk-delete",
			map[string]any{"ids": []string{"x"}}, nil)
		if w.Code != http.StatusUnauthorized {
			t.Errorf("status = %d, want 401", w.Code)
		}
	})
}

// TestBulkCreate_HTTP exercises POST /api/transactions/bulk to lock in the
// {inserted, skipped} response shape and the SHA256(importHash) dedup path.
func TestBulkCreate_HTTP(t *testing.T) {
	s := testutil.NewServer(t)
	s.Cookie = s.Login(t)
	accountID := s.SeededAccountID(t)

	postBulk := func(t *testing.T, body any) (int, map[string]int) {
		t.Helper()
		var resp map[string]int
		w := s.DoJSON(t, http.MethodPost, "/api/transactions/bulk", body, &resp)
		return w.Code, resp
	}

	t.Run("returns inserted=2, skipped=0 on first import", func(t *testing.T) {
		body := map[string]any{
			"transactions": []map[string]any{
				{"accountId": accountID, "kind": "expense", "amount": -10, "date": "2026-04-01", "importHash": "http-h-001"},
				{"accountId": accountID, "kind": "expense", "amount": -20, "date": "2026-04-02", "importHash": "http-h-002"},
			},
		}
		code, resp := postBulk(t, body)
		if code != http.StatusOK {
			t.Fatalf("status = %d, want 200 (body: %s)", code, body)
		}
		if resp["inserted"] != 2 {
			t.Errorf("inserted = %d, want 2", resp["inserted"])
		}
		if resp["skipped"] != 0 {
			t.Errorf("skipped = %d, want 0", resp["skipped"])
		}
	})

	t.Run("re-importing the same hashes returns inserted=0, skipped=2", func(t *testing.T) {
		body := map[string]any{
			"transactions": []map[string]any{
				{"accountId": accountID, "kind": "expense", "amount": -10, "date": "2026-04-01", "importHash": "http-h-001"},
				{"accountId": accountID, "kind": "expense", "amount": -20, "date": "2026-04-02", "importHash": "http-h-002"},
			},
		}
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
		s2 := testutil.NewServer(t)
		body := map[string]any{
			"transactions": []map[string]any{
				{"accountId": accountID, "kind": "expense", "amount": -1, "date": "2026-04-01"},
			},
		}
		w := s2.DoJSON(t, http.MethodPost, "/api/transactions/bulk", body, nil)
		if w.Code != http.StatusUnauthorized {
			t.Errorf("status = %d, want 401", w.Code)
		}
	})
}
