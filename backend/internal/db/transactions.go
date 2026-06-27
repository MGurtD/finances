package db

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/mgurt/finances/internal/models"
)

// TransactionsStore provides query methods for transactions.
type TransactionsStore struct {
	*Store
}

// TransactionFilters holds all optional filter parameters for List.
type TransactionFilters struct {
	AccountID   string
	CategoryID  string
	Kind        string
	Search      string
	From        string
	To          string
	Limit       int
	Offset      int
}

// List returns transactions matching the given filters, ordered by date desc, createdAt desc.
func (t *TransactionsStore) List(filters TransactionFilters) ([]models.Transaction, error) {
	where, args := buildTransactionWhereClause(filters)

	query := "SELECT id, account_id, category_id, kind, amount, description, notes, date, import_hash, transfer_account_id, created_at, updated_at FROM transactions"
	if where != "" {
		query += " WHERE " + where
	}
	query += " ORDER BY date DESC, created_at DESC"
	if filters.Limit > 0 {
		query += fmt.Sprintf(" LIMIT %d", filters.Limit)
	}
	if filters.Offset > 0 {
		query += fmt.Sprintf(" OFFSET %d", filters.Offset)
	}

	rows, err := t.DB.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var transactions []models.Transaction
	for rows.Next() {
		var tx models.Transaction
		err := rows.Scan(
			&tx.ID, &tx.AccountID, &tx.CategoryID, &tx.Kind, &tx.Amount,
			&tx.Description, &tx.Notes, &tx.Date, &tx.ImportHash,
			&tx.TransferAccountID, &tx.CreatedAt, &tx.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}
		transactions = append(transactions, tx)
	}
	return transactions, rows.Err()
}

func buildTransactionWhereClause(filters TransactionFilters) (string, []interface{}) {
	var conditions []string
	var args []interface{}

	if filters.AccountID != "" {
		conditions = append(conditions, "account_id = ?")
		args = append(args, filters.AccountID)
	}
	if filters.CategoryID != "" {
		conditions = append(conditions, "category_id = ?")
		args = append(args, filters.CategoryID)
	}
	if filters.Kind != "" {
		conditions = append(conditions, "kind = ?")
		args = append(args, filters.Kind)
	}
	if filters.Search != "" {
		conditions = append(conditions, "(description LIKE ? OR notes LIKE ?)")
		searchPattern := "%" + filters.Search + "%"
		args = append(args, searchPattern, searchPattern)
	}
	if filters.From != "" {
		conditions = append(conditions, "date >= ?")
		args = append(args, filters.From)
	}
	if filters.To != "" {
		conditions = append(conditions, "date <= ?")
		args = append(args, filters.To)
	}

	if len(conditions) == 0 {
		return "", nil
	}
	return strings.Join(conditions, " AND "), args
}

// ByID returns a single transaction by ID.
func (t *TransactionsStore) ByID(id string) (*models.Transaction, error) {
	query := "SELECT id, account_id, category_id, kind, amount, description, notes, date, import_hash, transfer_account_id, created_at, updated_at FROM transactions WHERE id = ?"
	var tx models.Transaction
	err := t.DB.QueryRow(query, id).Scan(
		&tx.ID, &tx.AccountID, &tx.CategoryID, &tx.Kind, &tx.Amount,
		&tx.Description, &tx.Notes, &tx.Date, &tx.ImportHash,
		&tx.TransferAccountID, &tx.CreatedAt, &tx.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("transaction not found")
	}
	if err != nil {
		return nil, err
	}
	return &tx, nil
}

// Create inserts a new transaction and returns it.
func (t *TransactionsStore) Create(req models.CreateTransactionReq) (*models.Transaction, error) {
	id := uuid.New().String()
	now := time.Now().UTC().Format(time.RFC3339)
	description := req.Description
	if description == "" {
		description = ""
	}
	notes := req.Notes
	if notes == "" {
		notes = ""
	}

	_, err := t.DB.Exec(`
		INSERT INTO transactions (id, account_id, category_id, kind, amount, description, notes, date, import_hash, transfer_account_id, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		id, req.AccountID, req.CategoryID, req.Kind, req.Amount, description, notes,
		req.Date, req.ImportHash, req.TransferAccountID, now, now)
	if err != nil {
		return nil, err
	}

	return t.ByID(id)
}

// Update modifies an existing transaction and returns it.
func (t *TransactionsStore) Update(id string, req models.UpdateTransactionReq) (*models.Transaction, error) {
	existing, err := t.ByID(id)
	if err != nil {
		return nil, err
	}

	categoryID := req.CategoryID
	if categoryID == nil {
		categoryID = existing.CategoryID
	}
	kind := req.Kind
	if kind == "" {
		kind = existing.Kind
	}
	amount := req.Amount
	if amount == 0 {
		amount = existing.Amount
	}
	description := req.Description
	if description == "" {
		description = existing.Description
	}
	notes := req.Notes
	if notes == "" {
		notes = existing.Notes
	}
	date := req.Date
	if date == "" {
		date = existing.Date
	}
	transferAccountID := req.TransferAccountID
	if transferAccountID == nil {
		transferAccountID = existing.TransferAccountID
	}
	now := time.Now().UTC().Format(time.RFC3339)

	_, err = t.DB.Exec(`
		UPDATE transactions SET category_id=?, kind=?, amount=?, description=?, notes=?, date=?, transfer_account_id=?, updated_at=? WHERE id=?`,
		categoryID, kind, amount, description, notes, date, transferAccountID, now, id)
	if err != nil {
		return nil, err
	}

	return t.ByID(id)
}

// Delete removes a transaction by ID.
func (t *TransactionsStore) Delete(id string) error {
	_, err := t.ByID(id)
	if err != nil {
		return err
	}
	_, err = t.DB.Exec("DELETE FROM transactions WHERE id = ?", id)
	return err
}

// BulkDelete removes multiple transactions in a single SQL statement.
// Returns the number of rows actually deleted (may be < len(ids) if some
// IDs no longer exist). The single-statement DELETE is atomic at the
// SQLite level — either all rows matching the IN clause are removed, or
// none (in the event of a constraint violation).
func (t *TransactionsStore) BulkDelete(ids []string) (int, error) {
	if len(ids) == 0 {
		return 0, nil
	}
	placeholders := make([]string, len(ids))
	args := make([]any, len(ids))
	for i, id := range ids {
		placeholders[i] = "?"
		args[i] = id
	}
	query := "DELETE FROM transactions WHERE id IN (" + strings.Join(placeholders, ",") + ")"
	res, err := t.DB.Exec(query, args...)
	if err != nil {
		return 0, err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return 0, err
	}
	return int(n), nil
}

// HasAny returns true if any transactions exist.
func (t *TransactionsStore) HasAny() (bool, error) {
	var count int
	err := t.DB.QueryRow("SELECT COUNT(*) FROM transactions").Scan(&count)
	if err != nil {
		return false, err
	}
	return count > 0, nil
}

// BulkCreate inserts multiple transactions, skipping those with importHash duplicates.
// Returns the count of actually inserted transactions.
func (t *TransactionsStore) BulkCreate(req models.BulkCreateReq) (int, error) {
	if len(req.Transactions) == 0 {
		return 0, nil
	}

	// Collect all importHashes to check for existing duplicates
	existingHashes := make(map[string]bool)
	for _, tx := range req.Transactions {
		if tx.ImportHash != nil && *tx.ImportHash != "" {
			// SHA256 the import hash as the DB stores it
			hash := sha256.Sum256([]byte(*tx.ImportHash))
			hashStr := hex.EncodeToString(hash[:])
			var count int
			err := t.DB.QueryRow("SELECT COUNT(*) FROM transactions WHERE import_hash = ?", hashStr).Scan(&count)
			if err != nil {
				return 0, err
			}
			if count > 0 {
				existingHashes[*tx.ImportHash] = true
			}
		}
	}

	now := time.Now().UTC().Format(time.RFC3339)
	inserted := 0

	for _, item := range req.Transactions {
		if item.ImportHash != nil && existingHashes[*item.ImportHash] {
			continue // skip duplicate
		}

		id := uuid.New().String()
		var importHashStr *string
		if item.ImportHash != nil && *item.ImportHash != "" {
			hash := sha256.Sum256([]byte(*item.ImportHash))
			s := hex.EncodeToString(hash[:])
			importHashStr = &s
		}

		_, err := t.DB.Exec(`
			INSERT INTO transactions (id, account_id, category_id, kind, amount, description, notes, date, import_hash, transfer_account_id, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			id, item.AccountID, item.CategoryID, item.Kind, item.Amount,
			item.Description, item.Notes, item.Date, importHashStr, item.TransferAccountID, now, now)
		if err != nil {
			return inserted, err
		}
		inserted++
	}

	return inserted, nil
}

// Recent returns the most recent transactions with account and category names.
func (t *TransactionsStore) Recent(limit int) ([]models.TransactionWithDetails, error) {
	if limit == 0 {
		limit = 10
	}

	query := `
		SELECT
			t.id, t.account_id, t.category_id, t.kind, t.amount, t.description, t.notes,
			t.date, t.import_hash, t.transfer_account_id, t.created_at, t.updated_at,
			a.name AS account_name,
			COALESCE(c.name, '') AS category_name,
			COALESCE(ta.name, '') AS transfer_account_name
		FROM transactions t
		JOIN accounts a ON a.id = t.account_id
		LEFT JOIN categories c ON c.id = t.category_id
		LEFT JOIN accounts ta ON ta.id = t.transfer_account_id
		ORDER BY t.date DESC, t.created_at DESC
		LIMIT ?`

	rows, err := t.DB.Query(query, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var transactions []models.TransactionWithDetails
	for rows.Next() {
		var tx models.TransactionWithDetails
		err := rows.Scan(
			&tx.ID, &tx.AccountID, &tx.CategoryID, &tx.Kind, &tx.Amount,
			&tx.Description, &tx.Notes, &tx.Date, &tx.ImportHash,
			&tx.TransferAccountID, &tx.CreatedAt, &tx.UpdatedAt,
			&tx.AccountName, &tx.CategoryName, &tx.TransferAccountName,
		)
		if err != nil {
			return nil, err
		}
		transactions = append(transactions, tx)
	}
	return transactions, rows.Err()
}

// SummaryByMonth returns income, expense, net, and count per month.
func (t *TransactionsStore) SummaryByMonth(months int) ([]models.SummaryByMonthItem, error) {
	if months == 0 {
		months = 12
	}

	query := `
		SELECT
			strftime('%Y-%m', date) AS month,
			COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) AS income,
			COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0) AS expense,
			COALESCE(SUM(amount), 0) AS net,
			COUNT(*) AS count
		FROM transactions
		GROUP BY strftime('%Y-%m', date)
		ORDER BY month DESC
		LIMIT ?`

	rows, err := t.DB.Query(query, months)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var summaries []models.SummaryByMonthItem
	for rows.Next() {
		var s models.SummaryByMonthItem
		err := rows.Scan(&s.Month, &s.Income, &s.Expense, &s.Net, &s.Count)
		if err != nil {
			return nil, err
		}
		summaries = append(summaries, s)
	}
	return summaries, rows.Err()
}

// SummaryByCategory returns total and count per category for a date range.
func (t *TransactionsStore) SummaryByCategory(from, to string) ([]models.SummaryByCategoryItem, error) {
	query := `
		SELECT
			t.category_id,
			COALESCE(c.name, 'Uncategorized') AS category_name,
			COALESCE(SUM(ABS(t.amount)), 0) AS total,
			COUNT(*) AS count
		FROM transactions t
		LEFT JOIN categories c ON c.id = t.category_id
		WHERE t.kind = 'expense' AND t.date >= ? AND t.date <= ?
		GROUP BY t.category_id
		ORDER BY total DESC`

	rows, err := t.DB.Query(query, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var summaries []models.SummaryByCategoryItem
	for rows.Next() {
		var s models.SummaryByCategoryItem
		err := rows.Scan(&s.CategoryID, &s.CategoryName, &s.Total, &s.Count)
		if err != nil {
			return nil, err
		}
		summaries = append(summaries, s)
	}
	return summaries, rows.Err()
}