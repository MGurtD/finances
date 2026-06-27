package db

import (
	"os"
	"testing"
)

func TestRunMigrations_CreatesAllTables(t *testing.T) {
	os.Setenv("DATABASE_URL", ":memory:")
	defer os.Unsetenv("DATABASE_URL")

	db, err := Open()
	if err != nil {
		t.Fatalf("Open failed: %v", err)
	}
	defer db.Close()

	// RED: RunMigrations should create all 4 tables
	err = RunMigrations(db)
	if err != nil {
		t.Fatalf("RunMigrations failed: %v", err)
	}

	// Verify accounts table
	var accountsCount int
	err = db.QueryRow("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='accounts'").Scan(&accountsCount)
	if err != nil {
		t.Fatalf("query failed: %v", err)
	}
	if accountsCount != 1 {
		t.Fatalf("accounts table not found")
	}

	// Verify categories table
	var categoriesCount int
	err = db.QueryRow("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='categories'").Scan(&categoriesCount)
	if err != nil {
		t.Fatalf("query failed: %v", err)
	}
	if categoriesCount != 1 {
		t.Fatalf("categories table not found")
	}

	// Verify transactions table
	var transactionsCount int
	err = db.QueryRow("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='transactions'").Scan(&transactionsCount)
	if err != nil {
		t.Fatalf("query failed: %v", err)
	}
	if transactionsCount != 1 {
		t.Fatalf("transactions table not found")
	}

	// Verify budgets table
	var budgetsCount int
	err = db.QueryRow("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='budgets'").Scan(&budgetsCount)
	if err != nil {
		t.Fatalf("query failed: %v", err)
	}
	if budgetsCount != 1 {
		t.Fatalf("budgets table not found")
	}

	// Verify all expected indexes exist
	indexes := []string{
		"accounts_archived_idx",
		"accounts_sort_order_idx",
		"categories_archived_idx",
		"categories_kind_idx",
		"categories_sort_order_idx",
		"transactions_date_idx",
		"transactions_account_idx",
		"transactions_category_idx",
		"transactions_account_date_idx",
		"transactions_import_hash_idx",
		"budgets_month_idx",
		"budgets_category_month_unique",
	}
	for _, idx := range indexes {
		var idxCount int
		err = db.QueryRow("SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name=?", idx).Scan(&idxCount)
		if err != nil {
			t.Fatalf("query failed: %v", err)
		}
		if idxCount != 1 {
			t.Fatalf("index %s not found", idx)
		}
	}

	// Verify FK constraints are set (foreign_keys=ON was set in Open)
	var fkMode int
	row := db.QueryRow("PRAGMA foreign_keys")
	if err := row.Scan(&fkMode); err != nil {
		t.Fatalf("PRAGMA foreign_keys failed: %v", err)
	}
	if fkMode != 1 {
		t.Fatalf("foreign_keys = %d, want 1 (should have been set in Open)", fkMode)
	}
}