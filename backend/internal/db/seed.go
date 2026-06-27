package db

import (
	"database/sql"
	"time"
)

// Seed creates the default account and category taxonomy if they don't exist.
//
// Idempotent: every step uses INSERT OR IGNORE / UPDATE-if-current-state-matches,
// so running Seed multiple times (or on a DB that already has the data) is a
// no-op. The function runs unconditionally on every server startup, but the
// cost when there's nothing to do is one SELECT COUNT(*) per concern.
func Seed(db *sql.DB) error {
	now := time.Now().UTC().Format(time.RFC3339)

	// 1. Default account. Skipped if accounts table is non-empty (legacy
	// behaviour — protects any user-customised accounts from being overwritten).
	var accountCount int
	if err := db.QueryRow("SELECT COUNT(*) FROM accounts").Scan(&accountCount); err != nil {
		return err
	}
	if accountCount == 0 {
		if _, err := db.Exec(`
			INSERT INTO accounts (id, name, type, currency, color, icon, initial_balance, sort_order, archived, created_at, updated_at)
			VALUES (?, 'Compte corrent', 'checking', 'EUR', '#6366F1', 'wallet', 0, 0, 0, ?, ?)`,
			"00000000-0000-0000-0000-000000000001", now, now); err != nil {
			return err
		}
	}

	// 2. Default category taxonomy. INSERT OR IGNORE keyed on the id, so
	// re-running on a DB that already has any of these rows is a no-op.
	// Keep this list in sync with the design spec — when adding categories,
	// prefer updating this seed over adding a new SQL migration.
	if err := seedDefaultCategories(db, now); err != nil {
		return err
	}

	// 3. Archive legacy seed categories. Runs every startup so that DBs which
	// pre-date the current taxonomy don't keep showing duplicate
	// "Habitatge"/"Subscripcions"/"Sou" entries in the UI. Idempotent because
	// the UPDATE has `AND archived = 0`.
	if err := archiveLegacyCategories(db); err != nil {
		return err
	}

	return nil
}

type seedCat struct {
	id        string
	name      string
	kind      string
	parentID  string // empty = top-level
	icon      string
	color     string
	sortOrder int
}

// defaultCategories is the canonical category taxonomy. Single source of truth
// for first-install seeds. ID ranges:
//
//	101–104  Ingressos (income)
//	201–218  Despeses (expense), with 218 as a child of 214
//
// When adding a category, append to the appropriate block and use the next
// free id in that range.
var defaultCategories = []seedCat{
	// ===== Ingressos =====
	{"00000000-0000-0000-0000-000000000101", "Nòmina", "income", "", "briefcase", "#2E7D32", 0},
	{"00000000-0000-0000-0000-000000000102", "Negoci / freelance", "income", "", "laptop", "#388E3C", 1},
	{"00000000-0000-0000-0000-000000000103", "Inversions", "income", "", "trending-up", "#43A047", 2},
	{"00000000-0000-0000-0000-000000000104", "Devolucions", "income", "", "rotate-ccw", "#66BB6A", 3},

	// ===== Despeses =====
	{"00000000-0000-0000-0000-000000000201", "Habitatge", "expense", "", "home", "#5D4037", 0},
	{"00000000-0000-0000-0000-000000000202", "Subministraments", "expense", "", "zap", "#1976D2", 1},
	{"00000000-0000-0000-0000-000000000203", "Alimentació", "expense", "", "shopping-cart", "#388E3C", 2},
	{"00000000-0000-0000-0000-000000000204", "Restaurants i oci", "expense", "", "utensils", "#ED6C02", 3},
	{"00000000-0000-0000-0000-000000000205", "Transport", "expense", "", "car", "#0288D1", 4},
	{"00000000-0000-0000-0000-000000000206", "Salut", "expense", "", "heart-pulse", "#E91E63", 5},
	{"00000000-0000-0000-0000-000000000207", "Compres", "expense", "", "shopping-bag", "#7B1FA2", 6},
	{"00000000-0000-0000-0000-000000000208", "Subscripcions", "expense", "", "repeat", "#5E35B1", 7},
	{"00000000-0000-0000-0000-000000000209", "Viatges", "expense", "", "plane", "#0097A7", 8},
	{"00000000-0000-0000-0000-000000000210", "Família", "expense", "", "users", "#F57C00", 9},
	{"00000000-0000-0000-0000-000000000211", "Impostos i finances", "expense", "", "landmark", "#6A1B9A", 10},
	{"00000000-0000-0000-0000-000000000212", "Treball", "expense", "", "briefcase", "#455A64", 11},
	{"00000000-0000-0000-0000-000000000213", "Altres despeses", "expense", "", "more-horizontal", "#8B7355", 12},
	{"00000000-0000-0000-0000-000000000214", "Transferències internes", "expense", "", "arrow-left-right", "#6D4C41", 13},
	{"00000000-0000-0000-0000-000000000215", "Targetes", "expense", "", "credit-card", "#283593", 14},
	{"00000000-0000-0000-0000-000000000216", "Efectiu", "expense", "", "wallet", "#33691E", 15},
	{"00000000-0000-0000-0000-000000000217", "Ajustos", "expense", "", "settings", "#4E342E", 16},

	// ===== Subcategoria: child of "Transferències internes" (214) =====
	{"00000000-0000-0000-0000-000000000218", "Entre comptes propis", "expense", "00000000-0000-0000-0000-000000000214", "user", "#6D4C41", 0},
}

func seedDefaultCategories(db *sql.DB, now string) error {
	for _, cat := range defaultCategories {
		var parentArg interface{}
		if cat.parentID != "" {
			parentArg = cat.parentID
		}
		// INSERT OR IGNORE: skip if the id already exists. Lets us run on
		// fresh DBs (inserts everything) and on existing DBs (no-op).
		if _, err := db.Exec(`
			INSERT OR IGNORE INTO categories
				(id, name, kind, parent_id, icon, color, sort_order, archived, created_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`,
			cat.id, cat.name, cat.kind, parentArg, cat.icon, cat.color, cat.sortOrder, now,
		); err != nil {
			return err
		}
	}
	return nil
}

// legacyCategoryIDs are the IDs from the original Go seed (the 5 categories
// that shipped with the v0.1.0 backend). They were replaced by the new taxonomy
// in defaultCategories, so we archive them on every seed run to keep the UI
// clean. Historical transactions still reference these IDs and remain intact —
// archiving only hides them from active listings.
var legacyCategoryIDs = []string{
	"00000000-0000-0000-0000-000000000011", // old Habitatge
	"00000000-0000-0000-0000-000000000012", // old Supermercat
	"00000000-0000-0000-0000-000000000013", // old Oci
	"00000000-0000-0000-0000-000000000014", // old Subscripcions
	"00000000-0000-0000-0000-000000000015", // old Sou
}

func archiveLegacyCategories(db *sql.DB) error {
	for _, id := range legacyCategoryIDs {
		// Only updates if the row exists AND isn't already archived, so this
		// is safe to run on every startup.
		if _, err := db.Exec(
			`UPDATE categories SET archived = 1 WHERE id = ? AND archived = 0`, id,
		); err != nil {
			return err
		}
	}
	return nil
}