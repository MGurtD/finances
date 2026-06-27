package db

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/mgurt/finances/internal/models"
)

// CreateAccountReq is the input for creating an account.
type CreateAccountReq struct {
	Name           string
	Type           string
	Color          string
	Icon           string
	InitialBalance int
	Currency       string
}

// UpdateAccountReq is the input for updating an account.
type UpdateAccountReq struct {
	Name  string
	Type  string
	Color string
	Icon  string
}

// AccountsStore provides query methods for accounts.
type AccountsStore struct {
	*Store
}

// List returns all accounts, optionally filtered to exclude archived.
func (a *AccountsStore) List(includeArchived bool) ([]models.Account, error) {
	query := "SELECT id, name, type, currency, color, icon, initial_balance, sort_order, archived, created_at, updated_at FROM accounts"
	if !includeArchived {
		query += " WHERE archived = 0"
	}
	query += " ORDER BY sort_order ASC, created_at ASC"

	rows, err := a.DB.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var accounts []models.Account
	for rows.Next() {
		var acc models.Account
		err := rows.Scan(&acc.ID, &acc.Name, &acc.Type, &acc.Currency, &acc.Color, &acc.Icon, &acc.InitialBalance, &acc.SortOrder, &acc.Archived, &acc.CreatedAt, &acc.UpdatedAt)
		if err != nil {
			return nil, err
		}
		accounts = append(accounts, acc)
	}
	return accounts, rows.Err()
}

// ByID returns a single account by ID.
func (a *AccountsStore) ByID(id string) (*models.Account, error) {
	query := "SELECT id, name, type, currency, color, icon, initial_balance, sort_order, archived, created_at, updated_at FROM accounts WHERE id = ?"
	var acc models.Account
	err := a.DB.QueryRow(query, id).Scan(&acc.ID, &acc.Name, &acc.Type, &acc.Currency, &acc.Color, &acc.Icon, &acc.InitialBalance, &acc.SortOrder, &acc.Archived, &acc.CreatedAt, &acc.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("account not found")
	}
	if err != nil {
		return nil, err
	}
	return &acc, nil
}

// Create inserts a new account and returns it.
func (a *AccountsStore) Create(req CreateAccountReq) (*models.Account, error) {
	id := uuid.New().String()
	now := time.Now().UTC().Format(time.RFC3339)
	currency := req.Currency
	if currency == "" {
		currency = "EUR"
	}
	color := req.Color
	if color == "" {
		color = "#6366F1"
	}
	icon := req.Icon
	if icon == "" {
		icon = "wallet"
	}

	_, err := a.DB.Exec(`
		INSERT INTO accounts (id, name, type, currency, color, icon, initial_balance, sort_order, archived, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)`,
		id, req.Name, req.Type, currency, color, icon, req.InitialBalance, now, now)
	if err != nil {
		return nil, err
	}

	return a.ByID(id)
}

// Update modifies an existing account and returns the updated account.
func (a *AccountsStore) Update(id string, req UpdateAccountReq) (*models.Account, error) {
	existing, err := a.ByID(id)
	if err != nil {
		return nil, err
	}

	name := req.Name
	if name == "" {
		name = existing.Name
	}
	accountType := req.Type
	if accountType == "" {
		accountType = existing.Type
	}
	color := req.Color
	if color == "" {
		color = existing.Color
	}
	icon := req.Icon
	if icon == "" {
		icon = existing.Icon
	}
	now := time.Now().UTC().Format(time.RFC3339)

	_, err = a.DB.Exec("UPDATE accounts SET name = ?, type = ?, color = ?, icon = ?, updated_at = ? WHERE id = ?",
		name, accountType, color, icon, now, id)
	if err != nil {
		return nil, err
	}

	return a.ByID(id)
}

// Archive sets archived=1 for the given account.
func (a *AccountsStore) Archive(id string) error {
	now := time.Now().UTC().Format(time.RFC3339)
	result, err := a.DB.Exec("UPDATE accounts SET archived = 1, updated_at = ? WHERE id = ?", now, id)
	if err != nil {
		return err
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return fmt.Errorf("account not found")
	}
	return nil
}

// Delete removes an account and all its transaction legs.
// Uses a transaction for atomicity. The account_id FK has ON DELETE CASCADE,
// and we explicitly delete transfer_account_id legs to ensure they're counted.
// Returns the count of transactions deleted.
func (a *AccountsStore) Delete(id string) (int, error) {
	_, err := a.ByID(id)
	if err != nil {
		return 0, err
	}

	// Count all transactions that will be deleted
	var txCount int
	err = a.DB.QueryRow(`
		SELECT COUNT(*) FROM transactions
		WHERE account_id = ? OR transfer_account_id = ?`, id, id).Scan(&txCount)
	if err != nil {
		return 0, err
	}

	// Use transaction for atomicity
	tx, err := a.DB.Begin()
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()

	// Delete transfer legs explicitly (transfer_account_id FK doesn't have CASCADE)
	_, err = tx.Exec("DELETE FROM transactions WHERE transfer_account_id = ?", id)
	if err != nil {
		return 0, err
	}

	// Delete account (account_id FK has CASCADE, so account_id legs are cascade-deleted)
	_, err = tx.Exec("DELETE FROM accounts WHERE id = ?", id)
	if err != nil {
		return 0, err
	}

	if err := tx.Commit(); err != nil {
		return 0, err
	}

	return txCount, nil
}

// Reorder updates sort_order for accounts based on the provided ID order.
func (a *AccountsStore) Reorder(order []string) error {
	if len(order) == 0 {
		return nil
	}

	tx, err := a.DB.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	for i, id := range order {
		_, err := tx.Exec("UPDATE accounts SET sort_order = ? WHERE id = ?", i, id)
		if err != nil {
			return err
		}
	}

	return tx.Commit()
}

// Balances returns all accounts with their computed balances
// (initial_balance + sum of transaction amounts).
func (a *AccountsStore) Balances() ([]models.AccountWithBalance, error) {
	query := `
		SELECT
			a.id, a.name, a.type, a.currency, a.color, a.icon, a.initial_balance,
			a.sort_order, a.archived, a.created_at, a.updated_at,
			COALESCE(SUM(t.amount), 0) + a.initial_balance AS balance
		FROM accounts a
		LEFT JOIN transactions t ON t.account_id = a.id
		GROUP BY a.id
		ORDER BY a.sort_order ASC, a.created_at ASC`

	rows, err := a.DB.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []models.AccountWithBalance
	for rows.Next() {
		var awb models.AccountWithBalance
		err := rows.Scan(
			&awb.ID, &awb.Name, &awb.Type, &awb.Currency, &awb.Color, &awb.Icon,
			&awb.InitialBalance, &awb.SortOrder, &awb.Archived, &awb.CreatedAt, &awb.UpdatedAt,
			&awb.Balance,
		)
		if err != nil {
			return nil, err
		}
		results = append(results, awb)
	}
	return results, rows.Err()
}