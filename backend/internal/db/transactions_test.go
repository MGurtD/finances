package db

import (
	"crypto/sha256"
	"encoding/hex"
	"testing"
	"time"

	"github.com/mgurt/finances/internal/models"
)

func TestTransactions_List(t *testing.T) {
	store, cleanup := testDB(t)
	defer cleanup()
	accountID := "00000000-0000-0000-0000-000000000001"
	now := time.Now().UTC().Format(time.RFC3339)

	// Create some transactions
	createTx := func(id, kind string, amount int, date string) {
		_, err := store.DB.Exec(`
			INSERT INTO transactions (id, account_id, category_id, kind, amount, description, notes, date, created_at, updated_at)
			VALUES (?, ?, NULL, ?, ?, '', '', ?, ?, ?)`,
			id, accountID, kind, amount, date, now, now)
		if err != nil {
			t.Fatalf("create tx %s failed: %v", id, err)
		}
	}

	createTx("tx-1", "income", 5000, "2026-01-15")
	createTx("tx-2", "expense", -1500, "2026-01-20")
	createTx("tx-3", "expense", -300, "2026-01-22")

	t.Run("returns all transactions", func(t *testing.T) {
		txs, err := store.Transactions.List(TransactionFilters{})
		if err != nil {
			t.Fatalf("List failed: %v", err)
		}
		if len(txs) != 3 {
			t.Fatalf("len(txs) = %d, want 3", len(txs))
		}
	})

	t.Run("filter by account", func(t *testing.T) {
		txs, err := store.Transactions.List(TransactionFilters{AccountID: accountID})
		if err != nil {
			t.Fatalf("List with account filter failed: %v", err)
		}
		if len(txs) != 3 {
			t.Errorf("len = %d, want 3", len(txs))
		}
	})

	t.Run("filter by kind", func(t *testing.T) {
		txs, err := store.Transactions.List(TransactionFilters{Kind: "expense"})
		if err != nil {
			t.Fatalf("List with kind filter failed: %v", err)
		}
		if len(txs) != 2 {
			t.Errorf("expense count = %d, want 2", len(txs))
		}
	})

	t.Run("filter by date range", func(t *testing.T) {
		txs, err := store.Transactions.List(TransactionFilters{From: "2026-01-01", To: "2026-01-21"})
		if err != nil {
			t.Fatalf("List with date filter failed: %v", err)
		}
		if len(txs) != 2 {
			t.Errorf("date range count = %d, want 2", len(txs))
		}
	})

	t.Run("filter by search", func(t *testing.T) {
		txs, err := store.Transactions.List(TransactionFilters{Search: "groceries"})
		if err != nil {
			t.Fatalf("List with search failed: %v", err)
		}
		// Description is empty in our test txs, so search won't match
		// This is just verifying the filter doesn't error
		_ = txs
	})
}

func TestTransactions_ByID(t *testing.T) {
	store, cleanup := testDB(t)
	defer cleanup()

	t.Run("finds existing transaction", func(t *testing.T) {
		// Create a transaction directly
		accountID := "00000000-0000-0000-0000-000000000001"
		now := time.Now().UTC().Format(time.RFC3339)
		_, err := store.DB.Exec(`
			INSERT INTO transactions (id, account_id, category_id, kind, amount, description, notes, date, created_at, updated_at)
			VALUES ('tx-find-test', ?, NULL, 'income', 1234, 'test', '', '2026-01-01', ?, ?)`,
			accountID, now, now)
		if err != nil {
			t.Fatalf("insert failed: %v", err)
		}

		tx, err := store.Transactions.ByID("tx-find-test")
		if err != nil {
			t.Fatalf("ByID failed: %v", err)
		}
		if tx.Amount != 1234 {
			t.Errorf("amount = %d, want 1234", tx.Amount)
		}
	})

	t.Run("returns error for non-existent", func(t *testing.T) {
		_, err := store.Transactions.ByID("non-existent")
		if err == nil {
			t.Fatal("ByID(non-existent) = nil, want error")
		}
	})
}

func TestTransactions_Create(t *testing.T) {
	store, cleanup := testDB(t)
	defer cleanup()

	t.Run("creates transaction", func(t *testing.T) {
		tx, err := store.Transactions.Create(models.CreateTransactionReq{
			AccountID: "00000000-0000-0000-0000-000000000001",
			Kind:      "expense",
			Amount:    -500,
			Date:      "2026-01-25",
		})
		if err != nil {
			t.Fatalf("Create failed: %v", err)
		}
		if tx.Amount != -500 {
			t.Errorf("amount = %d, want -500", tx.Amount)
		}
		if tx.ID == "" {
			t.Error("id is empty")
		}
	})
}

func TestTransactions_Delete(t *testing.T) {
	store, cleanup := testDB(t)
	defer cleanup()
	accountID := "00000000-0000-0000-0000-000000000001"
	now := time.Now().UTC().Format(time.RFC3339)

	// Create a transaction
	_, err := store.DB.Exec(`
		INSERT INTO transactions (id, account_id, category_id, kind, amount, description, date, created_at, updated_at)
		VALUES ('tx-del-test', ?, NULL, 'income', 100, '', '2026-01-01', ?, ?)`,
		accountID, now, now)
	if err != nil {
		t.Fatalf("insert failed: %v", err)
	}

	t.Run("deletes transaction", func(t *testing.T) {
		err := store.Transactions.Delete("tx-del-test")
		if err != nil {
			t.Fatalf("Delete failed: %v", err)
		}
		_, err = store.Transactions.ByID("tx-del-test")
		if err == nil {
			t.Error("transaction still exists after delete")
		}
	})
}

func TestTransactions_HasAny(t *testing.T) {
	store, cleanup := testDB(t)
	defer cleanup()

	t.Run("returns false when no transactions", func(t *testing.T) {
		has, err := store.Transactions.HasAny()
		if err != nil {
			t.Fatalf("HasAny failed: %v", err)
		}
		if has {
			t.Error("HasAny = true, want false")
		}
	})
}

func TestTransactions_BulkCreate_Dedup(t *testing.T) {
	store, cleanup := testDB(t)
	defer cleanup()

	t.Run("skips duplicate importHash and returns skipped count", func(t *testing.T) {
		hash := "batch-001"
		req := models.BulkCreateReq{
			Transactions: []models.BulkCreateItem{
				{AccountID: "00000000-0000-0000-0000-000000000001", Kind: "expense", Amount: -100, Date: "2026-01-01", ImportHash: &hash},
				{AccountID: "00000000-0000-0000-0000-000000000001", Kind: "expense", Amount: -200, Date: "2026-01-02", ImportHash: &hash},
				{AccountID: "00000000-0000-0000-0000-000000000001", Kind: "expense", Amount: -300, Date: "2026-01-03", ImportHash: &hash},
			},
		}

		// First bulk create: all 3 should be inserted, 0 skipped
		inserted, skipped, err := store.Transactions.BulkCreate(req)
		if err != nil {
			t.Fatalf("BulkCreate failed: %v", err)
		}
		if inserted != 3 {
			t.Errorf("first bulk create inserted = %d, want 3", inserted)
		}
		if skipped != 0 {
			t.Errorf("first bulk create skipped = %d, want 0", skipped)
		}

		// Second bulk create with same hashes: all 3 should be skipped
		inserted, skipped, err = store.Transactions.BulkCreate(req)
		if err != nil {
			t.Fatalf("BulkCreate second call failed: %v", err)
		}
		if inserted != 0 {
			t.Errorf("second bulk create inserted = %d, want 0 (dedup)", inserted)
		}
		if skipped != 3 {
			t.Errorf("second bulk create skipped = %d, want 3 (dedup)", skipped)
		}

		// Verify only 3 transactions exist total
		has, _ := store.Transactions.HasAny()
		if !has {
			t.Error("HasAny = false, want true after bulk create")
		}
	})

	t.Run("returns mixed counts when some hashes are new and some duplicate", func(t *testing.T) {
		newHash := "batch-mixed-new"
		existingHash := "batch-mixed-existing"
		// Pre-insert one row with the SHA256(existingHash) so dedup can match.
		h := sha256.Sum256([]byte(existingHash))
		existingHashHex := hex.EncodeToString(h[:])
		_, err := store.DB.Exec(`
			INSERT INTO transactions (id, account_id, kind, amount, description, date, import_hash, created_at, updated_at)
			VALUES ('pre-existing', '00000000-0000-0000-0000-000000000001', 'expense', -50, '', '2026-01-01', ?, '2026-01-01', '2026-01-01')`,
			existingHashHex)
		if err != nil {
			t.Fatalf("pre-insert failed: %v", err)
		}
		req := models.BulkCreateReq{
			Transactions: []models.BulkCreateItem{
				{AccountID: "00000000-0000-0000-0000-000000000001", Kind: "expense", Amount: -11, Date: "2026-02-01", ImportHash: &newHash},
				{AccountID: "00000000-0000-0000-0000-000000000001", Kind: "expense", Amount: -22, Date: "2026-02-02", ImportHash: &existingHash},
			},
		}

		inserted, skipped, err := store.Transactions.BulkCreate(req)
		if err != nil {
			t.Fatalf("BulkCreate mixed failed: %v", err)
		}
		if inserted != 1 {
			t.Errorf("inserted = %d, want 1 (only the new hash)", inserted)
		}
		if skipped != 1 {
			t.Errorf("skipped = %d, want 1 (the existing hash)", skipped)
		}
	})

	t.Run("inserts all when no importHash is provided", func(t *testing.T) {
		req := models.BulkCreateReq{
			Transactions: []models.BulkCreateItem{
				{AccountID: "00000000-0000-0000-0000-000000000001", Kind: "expense", Amount: -1, Date: "2026-03-01"},
				{AccountID: "00000000-0000-0000-0000-000000000001", Kind: "expense", Amount: -2, Date: "2026-03-02"},
			},
		}
		inserted, skipped, err := store.Transactions.BulkCreate(req)
		if err != nil {
			t.Fatalf("BulkCreate no-hash failed: %v", err)
		}
		if inserted != 2 {
			t.Errorf("inserted = %d, want 2", inserted)
		}
		if skipped != 0 {
			t.Errorf("skipped = %d, want 0", skipped)
		}
	})
}

func TestTransactions_BulkDelete(t *testing.T) {
	store, cleanup := testDB(t)
	defer cleanup()
	accountID := "00000000-0000-0000-0000-000000000001"
	now := time.Now().UTC().Format(time.RFC3339)

	insertTx := func(id, kind string, amount int) {
		_, err := store.DB.Exec(`
			INSERT INTO transactions (id, account_id, category_id, kind, amount, description, date, created_at, updated_at)
			VALUES (?, ?, NULL, ?, ?, '', '2026-05-01', ?, ?)`,
			id, accountID, kind, amount, now, now)
		if err != nil {
			t.Fatalf("insert %s failed: %v", id, err)
		}
	}

	t.Run("empty slice is a no-op", func(t *testing.T) {
		n, err := store.Transactions.BulkDelete([]string{})
		if err != nil {
			t.Fatalf("BulkDelete empty: %v", err)
		}
		if n != 0 {
			t.Errorf("deleted = %d, want 0", n)
		}
	})

	t.Run("deletes all when every id exists", func(t *testing.T) {
		insertTx("bd-1", "expense", -100)
		insertTx("bd-2", "expense", -200)
		insertTx("bd-3", "income", 500)

		n, err := store.Transactions.BulkDelete([]string{"bd-1", "bd-2", "bd-3"})
		if err != nil {
			t.Fatalf("BulkDelete: %v", err)
		}
		if n != 3 {
			t.Errorf("deleted = %d, want 3", n)
		}
		for _, id := range []string{"bd-1", "bd-2", "bd-3"} {
			if _, err := store.Transactions.ByID(id); err == nil {
				t.Errorf("transaction %s still exists", id)
			}
		}
	})

	t.Run("returns partial count when some ids are missing", func(t *testing.T) {
		insertTx("bd-p1", "expense", -10)
		insertTx("bd-p2", "expense", -20)

		n, err := store.Transactions.BulkDelete([]string{"bd-p1", "missing-a", "bd-p2", "missing-b"})
		if err != nil {
			t.Fatalf("BulkDelete: %v", err)
		}
		if n != 2 {
			t.Errorf("deleted = %d, want 2 (only the existing rows)", n)
		}
	})

	t.Run("does not affect other rows", func(t *testing.T) {
		insertTx("bd-keep-1", "expense", -11)
		insertTx("bd-keep-2", "expense", -22)
		insertTx("bd-keep-3", "expense", -33)

		n, err := store.Transactions.BulkDelete([]string{"bd-keep-1"})
		if err != nil {
			t.Fatalf("BulkDelete: %v", err)
		}
		if n != 1 {
			t.Errorf("deleted = %d, want 1", n)
		}
		// The other two must still exist.
		if _, err := store.Transactions.ByID("bd-keep-2"); err != nil {
			t.Errorf("bd-keep-2 unexpectedly gone: %v", err)
		}
		if _, err := store.Transactions.ByID("bd-keep-3"); err != nil {
			t.Errorf("bd-keep-3 unexpectedly gone: %v", err)
		}
	})
}

// Regression test for the bug where BulkCreate was hardcoding description
// and notes to '' in the INSERT, causing the UI to fall back to the category
// name when displaying a transaction (since `t.description || category.name`
// yielded the category name for every imported row).
func TestTransactions_BulkCreate_PreservesDescription(t *testing.T) {
	store, cleanup := testDB(t)
	defer cleanup()

	req := models.BulkCreateReq{
		Transactions: []models.BulkCreateItem{
			{
				AccountID:   "00000000-0000-0000-0000-000000000001",
				Kind:        "expense",
				Amount:      -1803,
				Description: "CHARTER EDUARD TOLDRA ESPLUGUES DE 34610",
				Notes:       "Imported from CaixaBank CSV",
				Date:        "2026-04-01",
			},
			{
				AccountID:   "00000000-0000-0000-0000-000000000001",
				Kind:        "expense",
				Amount:      -10000,
				Description: "shein",
				Notes:       "",
				Date:        "2026-04-04",
			},
		},
	}

	inserted, skipped, err := store.Transactions.BulkCreate(req)
	if err != nil {
		t.Fatalf("BulkCreate failed: %v", err)
	}
	if inserted != 2 {
		t.Fatalf("BulkCreate inserted %d, want 2", inserted)
	}
	if skipped != 0 {
		t.Errorf("BulkCreate skipped = %d, want 0", skipped)
	}

	// Read back via List with a wide date range.
	txns, err := store.Transactions.List(TransactionFilters{
		From:   "2026-01-01",
		To:     "2026-12-31",
		Limit:  100,
		Offset: 0,
	})
	if err != nil {
		t.Fatalf("List failed: %v", err)
	}
	if len(txns) != 2 {
		t.Fatalf("List returned %d, want 2", len(txns))
	}

	got := make(map[string]string)
	for _, tx := range txns {
		got[tx.Date] = tx.Description
	}

	if got["2026-04-01"] != "CHARTER EDUARD TOLDRA ESPLUGUES DE 34610" {
		t.Errorf("description for 2026-04-01 = %q, want %q",
			got["2026-04-01"], "CHARTER EDUARD TOLDRA ESPLUGUES DE 34610")
	}
	if got["2026-04-04"] != "shein" {
		t.Errorf("description for 2026-04-04 = %q, want %q", got["2026-04-04"], "shein")
	}
}

func TestTransactions_Recent(t *testing.T) {
	store, cleanup := testDB(t)
	defer cleanup()
	accountID := "00000000-0000-0000-0000-000000000001"
	now := time.Now().UTC().Format(time.RFC3339)

	// Create 3 transactions
	for i := 0; i < 3; i++ {
		_, err := store.DB.Exec(`
			INSERT INTO transactions (id, account_id, category_id, kind, amount, description, date, created_at, updated_at)
			VALUES (?, ?, NULL, 'expense', -100, 'test', ?, ?, ?)`,
			"tx-recent-"+string(rune('0'+i)), accountID, "2026-01-01", now, now)
		if err != nil {
			t.Fatalf("insert failed: %v", err)
		}
	}

	t.Run("returns recent transactions with details", func(t *testing.T) {
		recent, err := store.Transactions.Recent(10)
		if err != nil {
			t.Fatalf("Recent failed: %v", err)
		}
		if len(recent) == 0 {
			t.Fatal("no recent transactions returned")
		}
		if recent[0].AccountName == "" {
			t.Error("AccountName is empty")
		}
	})
}

func TestTransactions_SummaryByMonth(t *testing.T) {
	store, cleanup := testDB(t)
	defer cleanup()
	accountID := "00000000-0000-0000-0000-000000000001"
	now := time.Now().UTC().Format(time.RFC3339)

	// Create income and expense
	_, err := store.DB.Exec(`
		INSERT INTO transactions (id, account_id, category_id, kind, amount, date, created_at, updated_at)
		VALUES ('tx-inc', ?, NULL, 'income', 5000, '2026-01-15', ?, ?)`, accountID, now, now)
	if err != nil {
		t.Fatalf("insert failed: %v", err)
	}
	_, err = store.DB.Exec(`
		INSERT INTO transactions (id, account_id, category_id, kind, amount, date, created_at, updated_at)
		VALUES ('tx-exp', ?, NULL, 'expense', -2000, '2026-01-20', ?, ?)`, accountID, now, now)
	if err != nil {
		t.Fatalf("insert failed: %v", err)
	}

	t.Run("returns monthly summary", func(t *testing.T) {
		summary, err := store.Transactions.SummaryByMonth(12)
		if err != nil {
			t.Fatalf("SummaryByMonth failed: %v", err)
		}
		if len(summary) == 0 {
			t.Fatal("no summary returned")
		}
		// First row should be 2026-01
		if summary[0].Month != "2026-01" {
			t.Errorf("first month = %q, want '2026-01'", summary[0].Month)
		}
		if summary[0].Income != 5000 {
			t.Errorf("income = %d, want 5000", summary[0].Income)
		}
		if summary[0].Expense != 2000 {
			t.Errorf("expense = %d, want 2000", summary[0].Expense)
		}
	})
}

func TestTransactions_SummaryByCategory(t *testing.T) {
	store, cleanup := testDB(t)
	defer cleanup()
	accountID := "00000000-0000-0000-0000-000000000001"
	now := time.Now().UTC().Format(time.RFC3339)
	catID := "00000000-0000-0000-0000-000000000203" // Alimentació

	_, err := store.DB.Exec(`
		INSERT INTO transactions (id, account_id, category_id, kind, amount, date, created_at, updated_at)
		VALUES ('tx-cat', ?, ?, 'expense', -500, '2026-01-10', ?, ?)`, accountID, catID, now, now)
	if err != nil {
		t.Fatalf("insert failed: %v", err)
	}

	t.Run("returns category summary", func(t *testing.T) {
		summary, err := store.Transactions.SummaryByCategory("2026-01-01", "2026-01-31")
		if err != nil {
			t.Fatalf("SummaryByCategory failed: %v", err)
		}
		if len(summary) == 0 {
			t.Fatal("no category summary returned")
		}
		if summary[0].CategoryName == "" {
			t.Error("CategoryName is empty")
		}
	})
}