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

	t.Run("returns global budget plus per-category orphan rows", func(t *testing.T) {
		// Create a global budget for the month
		_, err := store.Budgets.Upsert(models.UpsertBudgetReq{
			Month:       "2026-01",
			AmountCents: 10000,
		})
		if err != nil {
			t.Fatalf("Upsert failed: %v", err)
		}

		// Create an expense transaction that consumes part of the global budget.
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

		// Expected: 1 global + every non-archived expense category seeded by default.
		// Seed inserts 17 expense categories, so we expect 18 rows.
		if len(status) < 2 {
			t.Fatalf("len(status) = %d, want at least 2 (global + categories)", len(status))
		}

		// Global row is first and has categoryId == nil.
		var global *models.BudgetStatusItem
		orphanCount := 0
		for i := range status {
			if status[i].CategoryID == nil {
				global = &status[i]
			} else if status[i].BudgetID == "" {
				orphanCount++
			}
		}
		if global == nil {
			t.Fatal("expected a global row (categoryId == nil)")
		}
		if global.SpentCents != 3000 {
			t.Errorf("global spentCents = %d, want 3000", global.SpentCents)
		}
		if global.RemainingCents != 7000 {
			t.Errorf("global remainingCents = %d, want 7000", global.RemainingCents)
		}
		if global.Percent != 30.0 {
			t.Errorf("global percent = %f, want 30.0", global.Percent)
		}
		if global.Status != "on_track" {
			t.Errorf("global status = %q, want \"on_track\" (30%% < 80%%)", global.Status)
		}
		if global.BudgetID == "" {
			t.Error("global row should have a budgetId")
		}
		if global.CategoryName == "" {
			t.Error("global row should have a categoryName")
		}
		// Every expense category from the seed should appear as an orphan
		// because no per-category budget was created in this test.
		if orphanCount < 10 {
			t.Errorf("orphan rows = %d, want at least 10 (seed has 17 expense categories)", orphanCount)
		}
	})

	t.Run("per-category budget marks categoryName and status", func(t *testing.T) {
		// 95% spent → "warning" status.
		_, err := store.Budgets.Upsert(models.UpsertBudgetReq{
			CategoryID:  ptr("00000000-0000-0000-0000-000000000203"), // Alimentació
			Month:       "2026-02",
			AmountCents: 10000,
		})
		if err != nil {
			t.Fatalf("Upsert failed: %v", err)
		}
		_, err = store.DB.Exec(`
			INSERT INTO transactions (id, account_id, category_id, kind, amount, date, created_at, updated_at)
			VALUES ('tx-cat-warn', ?, '00000000-0000-0000-0000-000000000203', 'expense', -9500, '2026-02-10', '2026-02-10T00:00:00Z', '2026-02-10T00:00:00Z')`,
			"00000000-0000-0000-0000-000000000001")
		if err != nil {
			t.Fatalf("insert expense failed: %v", err)
		}

		status, err := store.Budgets.Status("2026-02")
		if err != nil {
			t.Fatalf("Status failed: %v", err)
		}

		var row *models.BudgetStatusItem
		for i := range status {
			if status[i].CategoryID != nil && *status[i].CategoryID == "00000000-0000-0000-0000-000000000203" {
				row = &status[i]
				break
			}
		}
		if row == nil {
			t.Fatal("expected Alimentació row in status")
		}
		if row.CategoryName != "Alimentació" {
			t.Errorf("categoryName = %q, want \"Alimentació\"", row.CategoryName)
		}
		if row.CategoryColor == "" {
			t.Error("categoryColor should be populated")
		}
		if row.SpentCents != 9500 {
			t.Errorf("spentCents = %d, want 9500", row.SpentCents)
		}
		if row.BudgetCents != 10000 {
			t.Errorf("budgetCents = %d, want 10000", row.BudgetCents)
		}
		if row.Percent != 95.0 {
			t.Errorf("percent = %f, want 95.0", row.Percent)
		}
		if row.Status != "warning" {
			t.Errorf("status = %q, want \"warning\"", row.Status)
		}
	})

	t.Run("over budget marks status as over", func(t *testing.T) {
		_, err := store.Budgets.Upsert(models.UpsertBudgetReq{
			CategoryID:  ptr("00000000-0000-0000-0000-000000000204"), // Restaurants i oci
			Month:       "2026-03",
			AmountCents: 5000,
		})
		if err != nil {
			t.Fatalf("Upsert failed: %v", err)
		}
		_, err = store.DB.Exec(`
			INSERT INTO transactions (id, account_id, category_id, kind, amount, date, created_at, updated_at)
			VALUES ('tx-cat-over', ?, '00000000-0000-0000-0000-000000000204', 'expense', -8000, '2026-03-05', '2026-03-05T00:00:00Z', '2026-03-05T00:00:00Z')`,
			"00000000-0000-0000-0000-000000000001")
		if err != nil {
			t.Fatalf("insert expense failed: %v", err)
		}

		status, err := store.Budgets.Status("2026-03")
		if err != nil {
			t.Fatalf("Status failed: %v", err)
		}

		var row *models.BudgetStatusItem
		for i := range status {
			if status[i].CategoryID != nil && *status[i].CategoryID == "00000000-0000-0000-0000-000000000204" {
				row = &status[i]
				break
			}
		}
		if row == nil {
			t.Fatal("expected Restaurants i oci row in status")
		}
		if row.Percent != 160.0 {
			t.Errorf("percent = %f, want 160.0", row.Percent)
		}
		if row.Status != "over" {
			t.Errorf("status = %q, want \"over\"", row.Status)
		}
		if row.RemainingCents != -3000 {
			t.Errorf("remainingCents = %d, want -3000", row.RemainingCents)
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
		if summary.IncomeCents != 8000 {
			t.Errorf("income = %d, want 8000", summary.IncomeCents)
		}
		if summary.ExpenseCents != 3000 {
			t.Errorf("expense = %d, want 3000", summary.ExpenseCents)
		}
		if summary.NetSavingsCents != 5000 {
			t.Errorf("net = %d, want 5000", summary.NetSavingsCents)
		}
	})
}

// ptr is a helper to create *string from string
func ptr(s string) *string { return &s }