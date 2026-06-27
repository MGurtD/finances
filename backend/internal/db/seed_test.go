package db

import (
	"database/sql"
	"os"
	"testing"
)

// TestSeed_FreshInstall verifies the first-run experience: empty DB, then
// Seed produces 1 account and the full default category taxonomy.
func TestSeed_FreshInstall(t *testing.T) {
	os.Setenv("DATABASE_URL", ":memory:")
	defer os.Unsetenv("DATABASE_URL")

	db, err := Open()
	if err != nil {
		t.Fatalf("Open failed: %v", err)
	}
	defer db.Close()

	if err := RunMigrations(db); err != nil {
		t.Fatalf("RunMigrations failed: %v", err)
	}

	// Empty DB → Seed inserts the default account.
	if err := Seed(db); err != nil {
		t.Fatalf("Seed failed: %v", err)
	}

	// Verify exactly 1 account exists with the expected name/type.
	var accountCount int
	if err := db.QueryRow("SELECT COUNT(*) FROM accounts").Scan(&accountCount); err != nil {
		t.Fatalf("query failed: %v", err)
	}
	if accountCount != 1 {
		t.Fatalf("expected 1 account, got %d", accountCount)
	}

	var accountName, accountType string
	if err := db.QueryRow("SELECT name, type FROM accounts LIMIT 1").Scan(&accountName, &accountType); err != nil {
		t.Fatalf("query failed: %v", err)
	}
	if accountName != "Compte corrent" || accountType != "checking" {
		t.Errorf("account = (%q, %q), want (Compte corrent, checking)", accountName, accountType)
	}

	// Verify the full default taxonomy is present (22 rows).
	assertDefaultTaxonomy(t, db)
}

// TestSeed_Idempotent verifies that re-running Seed is a safe no-op: same
// counts before and after.
func TestSeed_Idempotent(t *testing.T) {
	os.Setenv("DATABASE_URL", ":memory:")
	defer os.Unsetenv("DATABASE_URL")

	db, err := Open()
	if err != nil {
		t.Fatalf("Open failed: %v", err)
	}
	defer db.Close()

	if err := RunMigrations(db); err != nil {
		t.Fatalf("RunMigrations failed: %v", err)
	}

	// Run Seed twice and verify counts don't change.
	if err := Seed(db); err != nil {
		t.Fatalf("Seed first call failed: %v", err)
	}

	first := countSnapshot(t, db)
	if err := Seed(db); err != nil {
		t.Fatalf("Seed second call failed: %v", err)
	}
	second := countSnapshot(t, db)

	if first != second {
		t.Errorf("Seed not idempotent: first run = %+v, second run = %+v", first, second)
	}
}

// TestSeed_ExistingDB verifies that on a DB that already has an account but
// no default categories, Seed inserts the categories but does NOT touch the
// existing account.
func TestSeed_ExistingDB(t *testing.T) {
	os.Setenv("DATABASE_URL", ":memory:")
	defer os.Unsetenv("DATABASE_URL")

	db, err := Open()
	if err != nil {
		t.Fatalf("Open failed: %v", err)
	}
	defer db.Close()

	if err := RunMigrations(db); err != nil {
		t.Fatalf("RunMigrations failed: %v", err)
	}

	// Pre-create a user account (not the default one) so Seed skips
	// account creation.
	now := "2026-01-01T00:00:00Z"
	if _, err := db.Exec(`
		INSERT INTO accounts (id, name, type, currency, color, icon, initial_balance, sort_order, archived, created_at, updated_at)
		VALUES (?, 'My Custom Account', 'savings', 'EUR', '#FF0000', 'piggy-bank', 0, 0, 0, ?, ?)`,
		"aaaaaaaa-bbbb-cccc-dddd-000000000001", now, now); err != nil {
		t.Fatalf("custom account insert failed: %v", err)
	}

	if err := Seed(db); err != nil {
		t.Fatalf("Seed failed: %v", err)
	}

	// Custom account should still exist unchanged.
	var name string
	if err := db.QueryRow("SELECT name FROM accounts WHERE id = 'aaaaaaaa-bbbb-cccc-dddd-000000000001'").Scan(&name); err != nil {
		t.Fatalf("query failed: %v", err)
	}
	if name != "My Custom Account" {
		t.Errorf("custom account was modified: name = %q", name)
	}

	// But default categories should now be present.
	assertDefaultTaxonomy(t, db)
}

// TestSeed_ArchivesLegacyCategories verifies that legacy seed IDs (011-015) get
// archived on every Seed run, even if the user manually unarchived them.
func TestSeed_ArchivesLegacyCategories(t *testing.T) {
	os.Setenv("DATABASE_URL", ":memory:")
	defer os.Unsetenv("DATABASE_URL")

	db, err := Open()
	if err != nil {
		t.Fatalf("Open failed: %v", err)
	}
	defer db.Close()

	if err := RunMigrations(db); err != nil {
		t.Fatalf("RunMigrations failed: %v", err)
	}

	// First seed creates the default account + taxonomy and archives legacy IDs.
	if err := Seed(db); err != nil {
		t.Fatalf("Seed failed: %v", err)
	}

	// Manually unarchive one legacy category (simulating user mistake / undo).
	if _, err := db.Exec(`UPDATE categories SET archived = 0 WHERE id = '00000000-0000-0000-0000-000000000011'`); err != nil {
		t.Fatalf("unarchive failed: %v", err)
	}

	// Re-run seed — the legacy row should be archived again.
	if err := Seed(db); err != nil {
		t.Fatalf("Seed second call failed: %v", err)
	}

	// Re-insert the legacy row in case it was missing (fresh DB never had it),
	// then unarchive again, then re-seed. This isolates the archive logic.
	now := "2026-01-01T00:00:00Z"
	if _, err := db.Exec(`
		INSERT OR IGNORE INTO categories (id, name, kind, parent_id, icon, color, sort_order, archived, created_at)
		VALUES ('00000000-0000-0000-0000-000000000011', 'Old Habitatge', 'expense', NULL, 'home', '#000', 99, 0, ?)`,
		now); err != nil {
		t.Fatalf("legacy insert failed: %v", err)
	}
	if _, err := db.Exec(`UPDATE categories SET archived = 0 WHERE id = '00000000-0000-0000-0000-000000000011'`); err != nil {
		t.Fatalf("unarchive failed: %v", err)
	}
	if err := Seed(db); err != nil {
		t.Fatalf("Seed third call failed: %v", err)
	}

	var archived int
	err = db.QueryRow(`SELECT archived FROM categories WHERE id = '00000000-0000-0000-0000-000000000011'`).Scan(&archived)
	if err == sql.ErrNoRows {
		t.Fatal("legacy row should exist after we inserted it")
	}
	if err != nil {
		t.Fatalf("query failed: %v", err)
	}
	if archived != 1 {
		t.Errorf("legacy category 011 archived = %d, want 1", archived)
	}
}

// assertDefaultTaxonomy verifies the full canonical category set is present
// after Seed runs. Used by multiple tests so all assertions live in one place.
func assertDefaultTaxonomy(t *testing.T, db *sql.DB) {
	t.Helper()

	var count int
	if err := db.QueryRow("SELECT COUNT(*) FROM categories").Scan(&count); err != nil {
		t.Fatalf("count query failed: %v", err)
	}
	// 4 income + 17 expense parent + 1 subcategory = 22 rows.
	if count != 22 {
		t.Fatalf("category count = %d, want 22", count)
	}

	expected := []string{
		// Ingressos
		"Nòmina", "Negoci / freelance", "Inversions", "Devolucions",
		// Despeses
		"Habitatge", "Subministraments", "Alimentació", "Restaurants i oci",
		"Transport", "Salut", "Compres", "Subscripcions", "Viatges",
		"Família", "Impostos i finances", "Treball", "Altres despeses",
		"Transferències internes", "Targetes", "Efectiu", "Ajustos",
		// Subcategoria
		"Entre comptes propis",
	}
	for _, name := range expected {
		var n int
		if err := db.QueryRow("SELECT COUNT(*) FROM categories WHERE name = ? AND archived = 0", name).Scan(&n); err != nil {
			t.Fatalf("query for %q failed: %v", name, err)
		}
		if n != 1 {
			t.Errorf("expected exactly 1 active category named %q, got %d", name, n)
		}
	}

	// Legacy IDs: if a row exists, it must be archived. Absent rows are fine
	// (fresh installs never had them).
	for _, id := range legacyCategoryIDs {
		var archived int
		err := db.QueryRow("SELECT archived FROM categories WHERE id = ?", id).Scan(&archived)
		if err == sql.ErrNoRows {
			continue // legacy row never existed — fine
		}
		if err != nil {
			t.Fatalf("query for legacy %s failed: %v", id, err)
		}
		if archived != 1 {
			t.Errorf("legacy category %s archived = %d, want 1", id, archived)
		}
	}

	// Subcategory must have its parent_id pointing at Transferències internes.
	var parentID sql.NullString
	if err := db.QueryRow("SELECT parent_id FROM categories WHERE name = 'Entre comptes propis'").Scan(&parentID); err != nil {
		t.Fatalf("query for subcategory parent failed: %v", err)
	}
	if !parentID.Valid || parentID.String == "" {
		t.Error("'Entre comptes propis' should have a non-null parent_id")
	}
}

// countSnapshot returns a simple "signature" of the DB state for idempotency
// comparisons.
func countSnapshot(t *testing.T, db *sql.DB) (sig string) {
	t.Helper()
	var accounts, categories, archivedCats int
	if err := db.QueryRow("SELECT COUNT(*) FROM accounts").Scan(&accounts); err != nil {
		t.Fatalf("accounts count failed: %v", err)
	}
	if err := db.QueryRow("SELECT COUNT(*) FROM categories").Scan(&categories); err != nil {
		t.Fatalf("categories count failed: %v", err)
	}
	if err := db.QueryRow("SELECT COUNT(*) FROM categories WHERE archived = 1").Scan(&archivedCats); err != nil {
		t.Fatalf("archived count failed: %v", err)
	}
	return "accounts=" + itoa(accounts) + ";categories=" + itoa(categories) + ";archived=" + itoa(archivedCats)
}

// itoa is a tiny helper to avoid pulling in strconv just for one call.
func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	var buf [20]byte
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		i--
		buf[i] = '-'
	}
	return string(buf[i:])
}