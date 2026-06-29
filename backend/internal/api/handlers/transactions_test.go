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

// createOneTx is a small helper that creates one expense transaction
// against the seeded default account and returns its id.
func createOneTx(t *testing.T, s *testutil.Server, accountID, date string, amount int) string {
	t.Helper()
	var created struct {
		ID string `json:"id"`
	}
	w := s.DoJSON(t, http.MethodPost, "/api/transactions", map[string]any{
		"accountId": accountID,
		"kind":      "expense",
		"amount":    amount,
		"date":      date,
	}, &created)
	if w.Code != http.StatusCreated {
		t.Fatalf("create tx: %d %s", w.Code, w.Body.String())
	}
	if created.ID == "" {
		t.Fatal("created tx has empty id")
	}
	return created.ID
}

// --- TestTransactions_List_HTTP -------------------------------------------

func TestTransactions_List_HTTP(t *testing.T) {
	t.Run("empty returns 200 with empty array", func(t *testing.T) {
		s, _ := loginAsAdmin(t)

		var resp []map[string]any
		w := s.DoJSON(t, http.MethodGet, "/api/transactions", nil, &resp)
		if w.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200", w.Code)
		}
		if len(resp) != 0 {
			t.Errorf("len = %d, want 0", len(resp))
		}
	})

	t.Run("one seeded returns 200 with 1 element", func(t *testing.T) {
		s, _ := loginAsAdmin(t)
		accountID := s.SeededAccountID(t)
		createOneTx(t, s, accountID, "2026-06-01", -100)

		var resp []map[string]any
		w := s.DoJSON(t, http.MethodGet, "/api/transactions", nil, &resp)
		if w.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200", w.Code)
		}
		if len(resp) != 1 {
			t.Errorf("len = %d, want 1", len(resp))
		}
	})

	t.Run("?accountId=… filters", func(t *testing.T) {
		s, _ := loginAsAdmin(t)
		accountID := s.SeededAccountID(t)
		createOneTx(t, s, accountID, "2026-06-01", -100)

		var resp []map[string]any
		w := s.DoJSON(t, http.MethodGet, "/api/transactions?accountId="+accountID, nil, &resp)
		if w.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200", w.Code)
		}
		if len(resp) != 1 {
			t.Errorf("len = %d, want 1 (accountId filter)", len(resp))
		}
	})

	t.Run("?from=…&to=… filters by date", func(t *testing.T) {
		s, _ := loginAsAdmin(t)
		accountID := s.SeededAccountID(t)
		createOneTx(t, s, accountID, "2026-05-15", -50)
		createOneTx(t, s, accountID, "2026-06-15", -50)

		var resp []map[string]any
		w := s.DoJSON(t, http.MethodGet,
			"/api/transactions?from=2026-06-01&to=2026-06-30", nil, &resp)
		if w.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200", w.Code)
		}
		if len(resp) != 1 {
			t.Errorf("len = %d, want 1 (May tx excluded)", len(resp))
		}
	})

	t.Run("returns 401 without auth cookie", func(t *testing.T) {
		s := testutil.NewServer(t)
		w := s.DoJSON(t, http.MethodGet, "/api/transactions", nil, nil)
		if w.Code != http.StatusUnauthorized {
			t.Errorf("status = %d, want 401", w.Code)
		}
	})
}

// --- TestTransactions_ByID_HTTP -------------------------------------------

func TestTransactions_ByID_HTTP(t *testing.T) {
	t.Run("valid id returns 200", func(t *testing.T) {
		s, _ := loginAsAdmin(t)
		accountID := s.SeededAccountID(t)
		id := createOneTx(t, s, accountID, "2026-06-01", -100)

		var resp map[string]any
		w := s.DoJSON(t, http.MethodGet, "/api/transactions/"+id, nil, &resp)
		if w.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200", w.Code)
		}
		if got, _ := resp["id"].(string); got != id {
			t.Errorf("id = %q, want %q", got, id)
		}
	})

	t.Run("unknown id returns 404 {error:transaction not found}", func(t *testing.T) {
		s, _ := loginAsAdmin(t)
		var resp models.ErrorResponse
		w := s.DoJSON(t, http.MethodGet, "/api/transactions/no-such-id", nil, &resp)
		if w.Code != http.StatusNotFound {
			t.Errorf("status = %d, want 404", w.Code)
		}
		if resp.Error != "transaction not found" {
			t.Errorf("error = %q, want 'transaction not found'", resp.Error)
		}
	})

	t.Run("returns 401 without auth cookie", func(t *testing.T) {
		s := testutil.NewServer(t)
		w := s.DoJSON(t, http.MethodGet, "/api/transactions/any", nil, nil)
		if w.Code != http.StatusUnauthorized {
			t.Errorf("status = %d, want 401", w.Code)
		}
	})
}

// --- TestTransactions_Create_HTTP -----------------------------------------

func TestTransactions_Create_HTTP(t *testing.T) {
	t.Run("valid body returns 201 with id", func(t *testing.T) {
		s, _ := loginAsAdmin(t)
		accountID := s.SeededAccountID(t)
		categoryID := s.SeededCategoryID(t, "Habitatge")

		body := map[string]any{
			"accountId":  accountID,
			"categoryId": categoryID,
			"kind":       "expense",
			"amount":     -1500,
			"date":       "2026-06-15",
		}
		var resp map[string]any
		w := s.DoJSON(t, http.MethodPost, "/api/transactions", body, &resp)
		if w.Code != http.StatusCreated {
			t.Fatalf("status = %d, want 201 (body: %s)", w.Code, w.Body.String())
		}
		if id, _ := resp["id"].(string); id == "" {
			t.Error("id is empty")
		}
	})

	t.Run("missing required fields returns 400", func(t *testing.T) {
		s, _ := loginAsAdmin(t)
		w := s.DoJSON(t, http.MethodPost, "/api/transactions",
			map[string]any{"amount": -100}, nil)
		if w.Code != http.StatusBadRequest {
			t.Errorf("status = %d, want 400", w.Code)
		}
	})

	t.Run("returns 401 without auth cookie", func(t *testing.T) {
		s := testutil.NewServer(t)
		w := s.DoJSON(t, http.MethodPost, "/api/transactions",
			map[string]any{"amount": -1, "date": "2026-06-01", "kind": "expense", "accountId": "x"},
			nil)
		if w.Code != http.StatusUnauthorized {
			t.Errorf("status = %d, want 401", w.Code)
		}
	})
}

// --- TestTransactions_Update_HTTP -----------------------------------------

func TestTransactions_Update_HTTP(t *testing.T) {
	t.Run("valid update returns 200", func(t *testing.T) {
		s, _ := loginAsAdmin(t)
		accountID := s.SeededAccountID(t)
		id := createOneTx(t, s, accountID, "2026-06-01", -100)

		var resp map[string]any
		w := s.DoJSON(t, http.MethodPut, "/api/transactions/"+id, map[string]any{
			"amount":     -200,
			"date":       "2026-06-02",
			"kind":       "expense",
			"accountId":  accountID,
		}, &resp)
		if w.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200 (body: %s)", w.Code, w.Body.String())
		}
		if got, _ := resp["amount"].(float64); int(got) != -200 {
			t.Errorf("amount = %v, want -200", resp["amount"])
		}
	})

	t.Run("unknown id returns 404", func(t *testing.T) {
		s, _ := loginAsAdmin(t)
		var resp models.ErrorResponse
		w := s.DoJSON(t, http.MethodPut, "/api/transactions/no-such-id",
			map[string]any{"amount": -1}, &resp)
		if w.Code != http.StatusNotFound {
			t.Errorf("status = %d, want 404", w.Code)
		}
		if resp.Error != "transaction not found" {
			t.Errorf("error = %q, want 'transaction not found'", resp.Error)
		}
	})

	t.Run("malformed JSON returns 400", func(t *testing.T) {
		s, _ := loginAsAdmin(t)
		accountID := s.SeededAccountID(t)
		id := createOneTx(t, s, accountID, "2026-06-01", -100)
		req := newJSONRequest(t, http.MethodPut, "/api/transactions/"+id, "not json", s.Cookie)
		w := s.Do(req)
		if w.Code != http.StatusBadRequest {
			t.Errorf("status = %d, want 400", w.Code)
		}
	})

	t.Run("returns 401 without auth cookie", func(t *testing.T) {
		s := testutil.NewServer(t)
		w := s.DoJSON(t, http.MethodPut, "/api/transactions/any",
			map[string]any{"amount": -1}, nil)
		if w.Code != http.StatusUnauthorized {
			t.Errorf("status = %d, want 401", w.Code)
		}
	})
}

// --- TestTransactions_Delete_HTTP -----------------------------------------

func TestTransactions_Delete_HTTP(t *testing.T) {
	t.Run("valid id returns 200 with ok:true", func(t *testing.T) {
		s, _ := loginAsAdmin(t)
		accountID := s.SeededAccountID(t)
		id := createOneTx(t, s, accountID, "2026-06-01", -100)

		var resp map[string]any
		w := s.DoJSON(t, http.MethodDelete, "/api/transactions/"+id, nil, &resp)
		if w.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200", w.Code)
		}
		if ok, _ := resp["ok"].(bool); !ok {
			t.Errorf("ok = %v, want true", resp["ok"])
		}
	})

	t.Run("unknown id returns 404", func(t *testing.T) {
		s, _ := loginAsAdmin(t)
		var resp models.ErrorResponse
		w := s.DoJSON(t, http.MethodDelete, "/api/transactions/no-such-id", nil, &resp)
		if w.Code != http.StatusNotFound {
			t.Errorf("status = %d, want 404", w.Code)
		}
		if resp.Error != "transaction not found" {
			t.Errorf("error = %q, want 'transaction not found'", resp.Error)
		}
	})

	t.Run("returns 401 without auth cookie", func(t *testing.T) {
		s := testutil.NewServer(t)
		w := s.DoJSON(t, http.MethodDelete, "/api/transactions/any", nil, nil)
		if w.Code != http.StatusUnauthorized {
			t.Errorf("status = %d, want 401", w.Code)
		}
	})
}

// --- TestTransactions_HasAny_HTTP -----------------------------------------

func TestTransactions_HasAny_HTTP(t *testing.T) {
	t.Run("empty returns 200 with hasAny:false", func(t *testing.T) {
		s, _ := loginAsAdmin(t)

		var resp map[string]any
		w := s.DoJSON(t, http.MethodGet, "/api/transactions/has-any", nil, &resp)
		if w.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200", w.Code)
		}
		if hasAny, _ := resp["hasAny"].(bool); hasAny {
			t.Error("hasAny = true, want false (empty db)")
		}
	})

	t.Run("seeded returns 200 with hasAny:true", func(t *testing.T) {
		s, _ := loginAsAdmin(t)
		accountID := s.SeededAccountID(t)
		createOneTx(t, s, accountID, "2026-06-01", -100)

		var resp map[string]any
		w := s.DoJSON(t, http.MethodGet, "/api/transactions/has-any", nil, &resp)
		if w.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200", w.Code)
		}
		if hasAny, _ := resp["hasAny"].(bool); !hasAny {
			t.Error("hasAny = false, want true")
		}
	})

	t.Run("returns 401 without auth cookie", func(t *testing.T) {
		s := testutil.NewServer(t)
		w := s.DoJSON(t, http.MethodGet, "/api/transactions/has-any", nil, nil)
		if w.Code != http.StatusUnauthorized {
			t.Errorf("status = %d, want 401", w.Code)
		}
	})
}

// --- TestTransactions_Recent_HTTP -----------------------------------------

func TestTransactions_Recent_HTTP(t *testing.T) {
	t.Run("seeded transactions returned in date desc order", func(t *testing.T) {
		s, _ := loginAsAdmin(t)
		accountID := s.SeededAccountID(t)
		// Create two transactions on different dates.
		createOneTx(t, s, accountID, "2026-06-01", -100)
		createOneTx(t, s, accountID, "2026-06-15", -200)

		var resp []map[string]any
		w := s.DoJSON(t, http.MethodGet, "/api/transactions/recent", nil, &resp)
		if w.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200", w.Code)
		}
		if len(resp) != 2 {
			t.Errorf("len = %d, want 2", len(resp))
		}
		// The most recent date should come first.
		first, _ := resp[0]["date"].(string)
		second, _ := resp[1]["date"].(string)
		if first != "2026-06-15" || second != "2026-06-01" {
			t.Errorf("order = [%s, %s], want [2026-06-15, 2026-06-01]", first, second)
		}
	})

	t.Run("?limit=K truncates results", func(t *testing.T) {
		s, _ := loginAsAdmin(t)
		accountID := s.SeededAccountID(t)
		for i := 1; i <= 3; i++ {
			createOneTx(t, s, accountID, "2026-06-01", -100*i)
		}

		var resp []map[string]any
		w := s.DoJSON(t, http.MethodGet, "/api/transactions/recent?limit=2", nil, &resp)
		if w.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200", w.Code)
		}
		if len(resp) != 2 {
			t.Errorf("len = %d, want 2 (limit=2)", len(resp))
		}
	})

	t.Run("returns 401 without auth cookie", func(t *testing.T) {
		s := testutil.NewServer(t)
		w := s.DoJSON(t, http.MethodGet, "/api/transactions/recent", nil, nil)
		if w.Code != http.StatusUnauthorized {
			t.Errorf("status = %d, want 401", w.Code)
		}
	})
}

// --- TestTransactions_SummaryByMonth_HTTP ---------------------------------

func TestTransactions_SummaryByMonth_HTTP(t *testing.T) {
	t.Run("empty returns 200 with empty array", func(t *testing.T) {
		s, _ := loginAsAdmin(t)

		var resp []map[string]any
		w := s.DoJSON(t, http.MethodGet, "/api/transactions/summary-by-month", nil, &resp)
		if w.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200", w.Code)
		}
		if len(resp) != 0 {
			t.Errorf("len = %d, want 0", len(resp))
		}
	})

	t.Run("transactions across months yield month buckets", func(t *testing.T) {
		s, _ := loginAsAdmin(t)
		accountID := s.SeededAccountID(t)
		// Two in June, one in May.
		createOneTx(t, s, accountID, "2026-06-01", -100)
		createOneTx(t, s, accountID, "2026-06-15", -50)
		createOneTx(t, s, accountID, "2026-05-15", -75)

		var resp []map[string]any
		w := s.DoJSON(t, http.MethodGet, "/api/transactions/summary-by-month", nil, &resp)
		if w.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200", w.Code)
		}
		if len(resp) != 2 {
			t.Fatalf("len = %d, want 2 (one per month)", len(resp))
		}
		// Buckets are ordered by month desc.
		first, _ := resp[0]["month"].(string)
		second, _ := resp[1]["month"].(string)
		if first != "2026-06" || second != "2026-05" {
			t.Errorf("months = [%s, %s], want [2026-06, 2026-05]", first, second)
		}
	})

	t.Run("returns 401 without auth cookie", func(t *testing.T) {
		s := testutil.NewServer(t)
		w := s.DoJSON(t, http.MethodGet, "/api/transactions/summary-by-month", nil, nil)
		if w.Code != http.StatusUnauthorized {
			t.Errorf("status = %d, want 401", w.Code)
		}
	})
}

// --- TestTransactions_SummaryByCategory_HTTP ------------------------------

func TestTransactions_SummaryByCategory_HTTP(t *testing.T) {
	t.Run("empty returns 200 with empty array", func(t *testing.T) {
		s, _ := loginAsAdmin(t)

		var resp []map[string]any
		w := s.DoJSON(t, http.MethodGet,
			"/api/transactions/summary-by-category?from=2026-06-01&to=2026-06-30", nil, &resp)
		if w.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200", w.Code)
		}
		if len(resp) != 0 {
			t.Errorf("len = %d, want 0", len(resp))
		}
	})

	t.Run("expenses across categories yield buckets summing correctly", func(t *testing.T) {
		s, _ := loginAsAdmin(t)
		accountID := s.SeededAccountID(t)
		cat1 := s.SeededCategoryID(t, "Habitatge")
		cat2 := s.SeededCategoryID(t, "Salut")

		// Two expenses in cat1, one in cat2.
		for _, c := range []struct {
			cat string
			amt int
		}{
			{cat1, -100},
			{cat1, -200},
			{cat2, -50},
		} {
			var created struct {
				ID string `json:"id"`
			}
			w := s.DoJSON(t, http.MethodPost, "/api/transactions", map[string]any{
				"accountId":  accountID,
				"categoryId": c.cat,
				"kind":       "expense",
				"amount":     c.amt,
				"date":       "2026-06-15",
			}, &created)
			if w.Code != http.StatusCreated {
				t.Fatalf("create: %d", w.Code)
			}
		}

		var resp []map[string]any
		w := s.DoJSON(t, http.MethodGet,
			"/api/transactions/summary-by-category?from=2026-06-01&to=2026-06-30", nil, &resp)
		if w.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200", w.Code)
		}
		if len(resp) != 2 {
			t.Fatalf("len = %d, want 2 (Habitatge + Salut)", len(resp))
		}
		// Buckets are ordered by total desc — Habitatge (300) before Salut (50).
		first, _ := resp[0]["categoryName"].(string)
		if first != "Habitatge" {
			t.Errorf("first bucket name = %q, want 'Habitatge'", first)
		}
		firstTotal, _ := resp[0]["total"].(float64)
		if int(firstTotal) != 300 {
			t.Errorf("first bucket total = %v, want 300 (100+200)", resp[0]["total"])
		}
		second, _ := resp[1]["categoryName"].(string)
		if second != "Salut" {
			t.Errorf("second bucket name = %q, want 'Salut'", second)
		}
		secondTotal, _ := resp[1]["total"].(float64)
		if int(secondTotal) != 50 {
			t.Errorf("second bucket total = %v, want 50", resp[1]["total"])
		}
	})

	t.Run("missing from or to returns 400", func(t *testing.T) {
		s, _ := loginAsAdmin(t)
		w := s.DoJSON(t, http.MethodGet, "/api/transactions/summary-by-category", nil, nil)
		if w.Code != http.StatusBadRequest {
			t.Errorf("no params: status = %d, want 400", w.Code)
		}
		w = s.DoJSON(t, http.MethodGet, "/api/transactions/summary-by-category?from=2026-06-01", nil, nil)
		if w.Code != http.StatusBadRequest {
			t.Errorf("no to: status = %d, want 400", w.Code)
		}
	})

	t.Run("returns 401 without auth cookie", func(t *testing.T) {
		s := testutil.NewServer(t)
		w := s.DoJSON(t, http.MethodGet,
			"/api/transactions/summary-by-category?from=2026-06-01&to=2026-06-30", nil, nil)
		if w.Code != http.StatusUnauthorized {
			t.Errorf("status = %d, want 401", w.Code)
		}
	})
}
