package db

import (
	"testing"

	"github.com/mgurt/finances/internal/models"
)

func TestBudgets_Upsert(t *testing.T) {
	store, cleanup := testDB(t)
	defer cleanup()

	t.Run("creates budget", func(t *testing.T) {
		budget, err := store.Budgets.Upsert(models.UpsertBudgetReq{
			Month:       "2026-01",
			AmountCents: 50000,
		})
		if err != nil {
			t.Fatalf("Upsert failed: %v", err)
		}
		if budget.AmountCents != 50000 {
			t.Errorf("amountCents = %d, want 50000", budget.AmountCents)
		}
		if budget.Month != "2026-01" {
			t.Errorf("month = %q, want '2026-01'", budget.Month)
		}
	})

	t.Run("upsert updates existing", func(t *testing.T) {
		budget, err := store.Budgets.Upsert(models.UpsertBudgetReq{
			Month:       "2026-01",
			AmountCents: 75000,
		})
		if err != nil {
			t.Fatalf("Upsert failed: %v", err)
		}
		if budget.AmountCents != 75000 {
			t.Errorf("after upsert: amountCents = %d, want 75000", budget.AmountCents)
		}

		// Should still be only 1 budget for 2026-01
		budgets, err := store.Budgets.List("2026-01")
		if err != nil {
			t.Fatalf("List failed: %v", err)
		}
		if len(budgets) != 1 {
			t.Errorf("budget count = %d, want 1 (upsert)", len(budgets))
		}
	})

	t.Run("upsert with categoryId", func(t *testing.T) {
		budget, err := store.Budgets.Upsert(models.UpsertBudgetReq{
			CategoryID:  ptr("00000000-0000-0000-0000-000000000203"), // Alimentació
			Month:       "2026-02",
			AmountCents: 30000,
		})
		if err != nil {
			t.Fatalf("Upsert with category failed: %v", err)
		}
		if budget.CategoryID == nil || *budget.CategoryID != "00000000-0000-0000-0000-000000000203" {
			t.Error("categoryId not set correctly")
		}
	})
}

func TestBudgets_Status(t *testing.T) {
	store, cleanup := testDB(t)
	defer cleanup()

	t.Run("returns budget status with progress", func(t *testing.T) {
		// Create a budget
		_, err := store.Budgets.Upsert(models.UpsertBudgetReq{
			Month:       "2026-01",
			AmountCents: 10000,
		})
		if err != nil {
			t.Fatalf("Upsert failed: %v", err)
		}

		// Create expense transactions that consume part of the budget
		accountID := "00000000-0000-0000-0000-000000000001"
		now := "2026-01-15T00:00:00Z"
		_, err = store.DB.Exec(`
			INSERT INTO transactions (id, account_id, category_id, kind, amount, date, created_at, updated_at)
			VALUES ('tx-budget-test', ?, NULL, 'expense', -3000, '2026-01-10', ?, ?)`,
			accountID, now, now)
		if err != nil {
			t.Fatalf("insert expense failed: %v", err)
		}

		status, err := store.Budgets.Status("2026-01")
		if err != nil {
			t.Fatalf("Status failed: %v", err)
		}
		if len(status) != 1 {
			t.Fatalf("len(status) = %d, want 1", len(status))
		}
		if status[0].SpentCents != 3000 {
			t.Errorf("spentCents = %d, want 3000", status[0].SpentCents)
		}
		if status[0].RemainingCents != 7000 {
			t.Errorf("remainingCents = %d, want 7000", status[0].RemainingCents)
		}
		if status[0].PercentUsed != 30.0 {
			t.Errorf("percentUsed = %f, want 30.0", status[0].PercentUsed)
		}
	})
}

func TestBudgets_Delete(t *testing.T) {
	store, cleanup := testDB(t)
	defer cleanup()

	budget, _ := store.Budgets.Upsert(models.UpsertBudgetReq{
		Month:       "2026-03",
		AmountCents: 20000,
	})

	t.Run("deletes budget", func(t *testing.T) {
		err := store.Budgets.Delete(budget.ID)
		if err != nil {
			t.Fatalf("Delete failed: %v", err)
		}
		_, err = store.Budgets.ByID(budget.ID)
		if err == nil {
			t.Error("budget still exists after delete")
		}
	})
}

func TestDashboard_Summary(t *testing.T) {
	store, cleanup := testDB(t)
	defer cleanup()

	t.Run("returns summary", func(t *testing.T) {
		accountID := "00000000-0000-0000-0000-000000000001"
		now := "2026-01-15T00:00:00Z"

		_, _ = store.DB.Exec(`
			INSERT INTO transactions (id, account_id, category_id, kind, amount, date, created_at, updated_at)
			VALUES ('tx-dash-1', ?, NULL, 'income', 8000, '2026-01-10', ?, ?)`, accountID, now, now)
		_, _ = store.DB.Exec(`
			INSERT INTO transactions (id, account_id, category_id, kind, amount, date, created_at, updated_at)
			VALUES ('tx-dash-2', ?, NULL, 'expense', -3000, '2026-01-12', ?, ?)`, accountID, now, now)

		summary, err := store.Dashboard.Summary("2026-01-01", "2026-01-31")
		if err != nil {
			t.Fatalf("Summary failed: %v", err)
		}
		if summary.Income != 8000 {
			t.Errorf("income = %d, want 8000", summary.Income)
		}
		if summary.Expense != 3000 {
			t.Errorf("expense = %d, want 3000", summary.Expense)
		}
		if summary.Net != 5000 {
			t.Errorf("net = %d, want 5000", summary.Net)
		}
	})
}

// ptr is a helper to create *string from string
func ptr(s string) *string { return &s }