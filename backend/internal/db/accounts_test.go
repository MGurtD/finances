package db

import (
	"testing"
	"time"
)

func TestAccounts_List(t *testing.T) {
	store, cleanup := testDB(t)
	defer cleanup()

	t.Run("returns seeded account", func(t *testing.T) {
		accounts, err := store.Accounts.List(false)
		if err != nil {
			t.Fatalf("List failed: %v", err)
		}
		if len(accounts) != 1 {
			t.Fatalf("len(accounts) = %d, want 1", len(accounts))
		}
		if accounts[0].Name != "Compte corrent" {
			t.Errorf("account name = %q, want 'Compte corrent'", accounts[0].Name)
		}
	})

	t.Run("archived accounts excluded when includeArchived=false", func(t *testing.T) {
		// Archive the seeded account
		err := store.Accounts.Archive("00000000-0000-0000-0000-000000000001")
		if err != nil {
			t.Fatalf("Archive failed: %v", err)
		}

		accounts, err := store.Accounts.List(false)
		if err != nil {
			t.Fatalf("List(false) failed: %v", err)
		}
		if len(accounts) != 0 {
			t.Errorf("List(false) with archived account returned %d, want 0", len(accounts))
		}
	})

	t.Run("archived accounts included when includeArchived=true", func(t *testing.T) {
		accounts, err := store.Accounts.List(true)
		if err != nil {
			t.Fatalf("List(true) failed: %v", err)
		}
		if len(accounts) != 1 {
			t.Errorf("List(true) returned %d, want 1", len(accounts))
		}
	})
}

func TestAccounts_ByID(t *testing.T) {
	store, cleanup := testDB(t)
	defer cleanup()

	t.Run("finds existing account", func(t *testing.T) {
		account, err := store.Accounts.ByID("00000000-0000-0000-0000-000000000001")
		if err != nil {
			t.Fatalf("ByID failed: %v", err)
		}
		if account.Name != "Compte corrent" {
			t.Errorf("account name = %q, want 'Compte corrent'", account.Name)
		}
	})

	t.Run("returns error for non-existent id", func(t *testing.T) {
		_, err := store.Accounts.ByID("non-existent-id")
		if err == nil {
			t.Fatal("ByID(non-existent) = nil, want error")
		}
	})
}

func TestAccounts_Create(t *testing.T) {
	store, cleanup := testDB(t)
	defer cleanup()

	t.Run("creates new account with required fields", func(t *testing.T) {
		req := CreateAccountReq{Name: "Savings", Type: "savings"}
		account, err := store.Accounts.Create(req)
		if err != nil {
			t.Fatalf("Create failed: %v", err)
		}
		if account.Name != "Savings" {
			t.Errorf("account name = %q, want 'Savings'", account.Name)
		}
		if account.Type != "savings" {
			t.Errorf("account type = %q, want 'savings'", account.Type)
		}
		if account.ID == "" {
			t.Error("account id is empty")
		}
		if account.Currency != "EUR" {
			t.Errorf("account currency = %q, want 'EUR' (default)", account.Currency)
		}
	})

	t.Run("creates account with all fields", func(t *testing.T) {
		req := CreateAccountReq{
			Name:           "Investment",
			Type:           "investment",
			Color:          "#00FF00",
			Icon:           "chart",
			InitialBalance: 1000,
			Currency:       "EUR",
		}
		account, err := store.Accounts.Create(req)
		if err != nil {
			t.Fatalf("Create failed: %v", err)
		}
		if account.Color != "#00FF00" {
			t.Errorf("account color = %q, want '#00FF00'", account.Color)
		}
		if account.InitialBalance != 1000 {
			t.Errorf("account initialBalance = %d, want 1000", account.InitialBalance)
		}
	})
}

func TestAccounts_Update(t *testing.T) {
	store, cleanup := testDB(t)
	defer cleanup()
	id := "00000000-0000-0000-0000-000000000001"

	t.Run("updates account fields", func(t *testing.T) {
		req := UpdateAccountReq{Name: "Updated Name", Color: "#FF0000"}
		account, err := store.Accounts.Update(id, req)
		if err != nil {
			t.Fatalf("Update failed: %v", err)
		}
		if account.Name != "Updated Name" {
			t.Errorf("account name = %q, want 'Updated Name'", account.Name)
		}
		if account.Color != "#FF0000" {
			t.Errorf("account color = %q, want '#FF0000'", account.Color)
		}
	})

	t.Run("returns error for non-existent id", func(t *testing.T) {
		req := UpdateAccountReq{Name: "Test"}
		_, err := store.Accounts.Update("non-existent", req)
		if err == nil {
			t.Fatal("Update(non-existent) = nil, want error")
		}
	})
}

func TestAccounts_Archive(t *testing.T) {
	store, cleanup := testDB(t)
	defer cleanup()
	id := "00000000-0000-0000-0000-000000000001"

	t.Run("archives account", func(t *testing.T) {
		err := store.Accounts.Archive(id)
		if err != nil {
			t.Fatalf("Archive failed: %v", err)
		}

		account, err := store.Accounts.ByID(id)
		if err != nil {
			t.Fatalf("ByID after Archive failed: %v", err)
		}
		if account.Archived != 1 {
			t.Errorf("account.archived = %d, want 1", account.Archived)
		}
	})
}

func TestAccounts_Delete(t *testing.T) {
	store, cleanup := testDB(t)
	defer cleanup()

	t.Run("deletes account and cascades transactions", func(t *testing.T) {
		// Create a second account for transfer testing
		account2, err := store.Accounts.Create(CreateAccountReq{Name: "Account2", Type: "checking"})
		if err != nil {
			t.Fatalf("Create account2 failed: %v", err)
		}

		// Create a transaction for the first account (single leg)
		now := time.Now().UTC().Format(time.RFC3339)
		_, err = store.DB.Exec(`
			INSERT INTO transactions (id, account_id, category_id, kind, amount, description, date, created_at, updated_at)
			VALUES ('tx-001', '00000000-0000-0000-0000-000000000001', NULL, 'expense', -100, 'test', '2026-01-01', ?, ?)`,
			now, now)
		if err != nil {
			t.Fatalf("Create transaction failed: %v", err)
		}

		// Create a transfer transaction (two legs)
		_, err = store.DB.Exec(`
			INSERT INTO transactions (id, account_id, category_id, kind, amount, description, date, transfer_account_id, created_at, updated_at)
			VALUES ('tx-002', '00000000-0000-0000-0000-000000000001', NULL, 'transfer', -50, 'transfer', '2026-01-01', ?, ?, ?)`,
			account2.ID, now, now)
		if err != nil {
			t.Fatalf("Create transfer failed: %v", err)
		}

		// Delete the first account (should cascade both legs)
		deletedCount, err := store.Accounts.Delete("00000000-0000-0000-0000-000000000001")
		if err != nil {
			t.Fatalf("Delete failed: %v", err)
		}
		if deletedCount != 2 {
			t.Errorf("deletedCount = %d, want 2 (2 transaction legs)", deletedCount)
		}

		// Verify account is deleted
		_, err = store.Accounts.ByID("00000000-0000-0000-0000-000000000001")
		if err == nil {
			t.Error("account still exists after delete")
		}

		// Verify transactions are deleted
		var txCount int
		err = store.DB.QueryRow("SELECT COUNT(*) FROM transactions WHERE id IN ('tx-001', 'tx-002')").Scan(&txCount)
		if err != nil {
			t.Fatalf("query failed: %v", err)
		}
		if txCount != 0 {
			t.Errorf("transactions still exist after cascade delete: %d remaining", txCount)
		}
	})
}

func TestAccounts_Reorder(t *testing.T) {
	store, cleanup := testDB(t)
	defer cleanup()

	// Create 3 accounts with specific IDs
	var ids []string
	for i := 0; i < 3; i++ {
		acc, err := store.Accounts.Create(CreateAccountReq{Name: "Account", Type: "checking"})
		if err != nil {
			t.Fatalf("Create failed: %v", err)
		}
		ids = append(ids, acc.ID)
	}

	t.Run("updates sort_order based on provided order", func(t *testing.T) {
		// Provide reverse order
		reversed := []string{ids[2], ids[1], ids[0]}
		err := store.Accounts.Reorder(reversed)
		if err != nil {
			t.Fatalf("Reorder failed: %v", err)
		}

		// Verify sort_order values
		for i, id := range reversed {
			acc, err := store.Accounts.ByID(id)
			if err != nil {
				t.Fatalf("ByID failed: %v", err)
			}
			if acc.SortOrder != i {
				t.Errorf("account %s sortOrder = %d, want %d", id, acc.SortOrder, i)
			}
		}
	})
}

func TestAccounts_Balances(t *testing.T) {
	store, cleanup := testDB(t)
	defer cleanup()

	t.Run("initial balance only when no transactions", func(t *testing.T) {
		balances, err := store.Accounts.Balances()
		if err != nil {
			t.Fatalf("Balances failed: %v", err)
		}
		if len(balances) != 1 {
			t.Fatalf("len(balances) = %d, want 1", len(balances))
		}
		// "Compte corrent" has initialBalance=0
		if balances[0].Balance != 0 {
			t.Errorf("balance = %d, want 0 (initial balance)", balances[0].Balance)
		}
	})

	t.Run("balance includes transactions", func(t *testing.T) {
		accountID := "00000000-0000-0000-0000-000000000001"
		now := time.Now().UTC().Format(time.RFC3339)

		// Add income transaction
		_, err := store.DB.Exec(`
			INSERT INTO transactions (id, account_id, category_id, kind, amount, description, date, created_at, updated_at)
			VALUES ('tx-income', ?, NULL, 'income', 5000, 'salary', '2026-01-15', ?, ?)`,
			accountID, now, now)
		if err != nil {
			t.Fatalf("Create income transaction failed: %v", err)
		}

		// Add expense transaction
		_, err = store.DB.Exec(`
			INSERT INTO transactions (id, account_id, category_id, kind, amount, description, date, created_at, updated_at)
			VALUES ('tx-expense', ?, NULL, 'expense', -1500, 'groceries', '2026-01-20', ?, ?)`,
			accountID, now, now)
		if err != nil {
			t.Fatalf("Create expense transaction failed: %v", err)
		}

		balances, err := store.Accounts.Balances()
		if err != nil {
			t.Fatalf("Balances failed: %v", err)
		}

		// Find our account in the results
		var balance int
		for _, b := range balances {
			if b.ID == accountID {
				balance = b.Balance
				break
			}
		}
		// 5000 (income) + (-1500) (expense) = 3500
		if balance != 3500 {
			t.Errorf("balance = %d, want 3500 (5000 - 1500)", balance)
		}
	})
}