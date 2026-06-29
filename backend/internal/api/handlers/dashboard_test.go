package handlers_test

import (
	"net/http"
	"testing"

	"github.com/mgurt/finances/internal/api/testutil"
)

// --- TestDashboard_Summary_HTTP -------------------------------------------

func TestDashboard_Summary_HTTP(t *testing.T) {
	t.Run("empty returns 200 with zero aggregation", func(t *testing.T) {
		s, _ := loginAsAdmin(t)

		var resp map[string]any
		w := s.DoJSON(t, http.MethodGet,
			"/api/dashboard/summary?from=2026-06-01&to=2026-06-30", nil, &resp)
		if w.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200 (body: %s)", w.Code, w.Body.String())
		}
		if income, _ := resp["income"].(float64); int(income) != 0 {
			t.Errorf("income = %v, want 0", resp["income"])
		}
		if expense, _ := resp["expense"].(float64); int(expense) != 0 {
			t.Errorf("expense = %v, want 0", resp["expense"])
		}
		if net, _ := resp["net"].(float64); int(net) != 0 {
			t.Errorf("net = %v, want 0", resp["net"])
		}
		if count, _ := resp["count"].(float64); int(count) != 0 {
			t.Errorf("count = %v, want 0", resp["count"])
		}
	})

	t.Run("seeded 1 income + 1 expense in same month reflects net_savings = income - expense", func(t *testing.T) {
		s, _ := loginAsAdmin(t)
		accountID := s.SeededAccountID(t)
		incomeCat := s.SeededCategoryID(t, "Nòmina")
		expenseCat := s.SeededCategoryID(t, "Habitatge")

		// Income of 3000 in mid-June.
		w := s.DoJSON(t, http.MethodPost, "/api/transactions", map[string]any{
			"accountId":  accountID,
			"categoryId": incomeCat,
			"kind":       "income",
			"amount":     3000,
			"date":       "2026-06-10",
		}, nil)
		if w.Code != http.StatusCreated {
			t.Fatalf("create income: %d %s", w.Code, w.Body.String())
		}
		// Expense of 1200 in mid-June.
		w = s.DoJSON(t, http.MethodPost, "/api/transactions", map[string]any{
			"accountId":  accountID,
			"categoryId": expenseCat,
			"kind":       "expense",
			"amount":     -1200,
			"date":       "2026-06-15",
		}, nil)
		if w.Code != http.StatusCreated {
			t.Fatalf("create expense: %d %s", w.Code, w.Body.String())
		}

		var resp map[string]any
		w = s.DoJSON(t, http.MethodGet,
			"/api/dashboard/summary?from=2026-06-01&to=2026-06-30", nil, &resp)
		if w.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200 (body: %s)", w.Code, w.Body.String())
		}
		if income, _ := resp["incomeCents"].(float64); int(income) != 3000 {
			t.Errorf("income = %v, want 3000", resp["incomeCents"])
		}
		if expense, _ := resp["expenseCents"].(float64); int(expense) != 1200 {
			t.Errorf("expense = %v, want 1200", resp["expenseCents"])
		}
		// net = income - expense = 1800 (store computes net from signed sum).
		if net, _ := resp["netSavingsCents"].(float64); int(net) != 1800 {
			t.Errorf("net = %v, want 1800 (3000 - 1200)", resp["netSavingsCents"])
		}
		if count, _ := resp["transactionCount"].(float64); int(count) != 2 {
			t.Errorf("count = %v, want 2", resp["transactionCount"])
		}
	})

	t.Run("date range ?from=…&to=… is honored", func(t *testing.T) {
		s, _ := loginAsAdmin(t)
		accountID := s.SeededAccountID(t)
		incomeCat := s.SeededCategoryID(t, "Nòmina")

		// One tx in May, one in June.
		for _, date := range []string{"2026-05-15", "2026-06-15"} {
			w := s.DoJSON(t, http.MethodPost, "/api/transactions", map[string]any{
				"accountId":  accountID,
				"categoryId": incomeCat,
				"kind":       "income",
				"amount":     1000,
				"date":       date,
			}, nil)
			if w.Code != http.StatusCreated {
				t.Fatalf("create tx %s: %d", date, w.Code)
			}
		}

		// Query only June.
		var resp map[string]any
		w := s.DoJSON(t, http.MethodGet,
			"/api/dashboard/summary?from=2026-06-01&to=2026-06-30", nil, &resp)
		if w.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200", w.Code)
		}
		if count, _ := resp["transactionCount"].(float64); int(count) != 1 {
			t.Errorf("count = %v, want 1 (May tx excluded by date range)", resp["transactionCount"])
		}
		if income, _ := resp["incomeCents"].(float64); int(income) != 1000 {
			t.Errorf("income = %v, want 1000", resp["incomeCents"])
		}
	})

	t.Run("missing from or to returns 400", func(t *testing.T) {
		s, _ := loginAsAdmin(t)
		w := s.DoJSON(t, http.MethodGet, "/api/dashboard/summary", nil, nil)
		if w.Code != http.StatusBadRequest {
			t.Errorf("no params: status = %d, want 400 (body: %s)", w.Code, w.Body.String())
		}
		w = s.DoJSON(t, http.MethodGet, "/api/dashboard/summary?from=2026-06-01", nil, nil)
		if w.Code != http.StatusBadRequest {
			t.Errorf("no to: status = %d, want 400", w.Code)
		}
	})

	t.Run("returns 401 without auth cookie", func(t *testing.T) {
		s := testutil.NewServer(t)
		w := s.DoJSON(t, http.MethodGet,
			"/api/dashboard/summary?from=2026-06-01&to=2026-06-30", nil, nil)
		if w.Code != http.StatusUnauthorized {
			t.Errorf("status = %d, want 401", w.Code)
		}
	})
}
