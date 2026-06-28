package db

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/mgurt/finances/internal/models"
)

// BudgetsStore provides query methods for budgets.
type BudgetsStore struct {
	*Store
}

// List returns all budgets, optionally filtered by month.
func (b *BudgetsStore) List(month string) ([]models.Budget, error) {
	query := "SELECT id, category_id, month, amount_cents, created_at, updated_at FROM budgets"
	var args []interface{}
	if month != "" {
		query += " WHERE month = ?"
		args = append(args, month)
	}
	query += " ORDER BY created_at ASC"

	rows, err := b.DB.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var budgets []models.Budget
	for rows.Next() {
		var budget models.Budget
		err := rows.Scan(&budget.ID, &budget.CategoryID, &budget.Month, &budget.AmountCents, &budget.CreatedAt, &budget.UpdatedAt)
		if err != nil {
			return nil, err
		}
		budgets = append(budgets, budget)
	}
	return budgets, rows.Err()
}

// Upsert creates or updates a budget. Handles NULL categoryId (global budget per month).
func (b *BudgetsStore) Upsert(req models.UpsertBudgetReq) (*models.Budget, error) {
	now := time.Now().UTC().Format(time.RFC3339)

	// Try to find existing budget for (categoryId, month)
	var existingID string
	var found bool

	if req.CategoryID == nil {
		err := b.DB.QueryRow("SELECT id FROM budgets WHERE category_id IS NULL AND month = ?", req.Month).Scan(&existingID)
		if err == nil {
			found = true
		} else if err != sql.ErrNoRows {
			return nil, err
		}
	} else {
		err := b.DB.QueryRow("SELECT id FROM budgets WHERE category_id = ? AND month = ?", *req.CategoryID, req.Month).Scan(&existingID)
		if err == nil {
			found = true
		} else if err != sql.ErrNoRows {
			return nil, err
		}
	}

	if found {
		// Update existing
		_, err := b.DB.Exec("UPDATE budgets SET amount_cents = ?, updated_at = ? WHERE id = ?",
			req.AmountCents, now, existingID)
		if err != nil {
			return nil, err
		}
		return b.ByID(existingID)
	}

	// Create new
	id := uuid.New().String()
	_, err := b.DB.Exec(`
		INSERT INTO budgets (id, category_id, month, amount_cents, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?)`,
		id, req.CategoryID, req.Month, req.AmountCents, now, now)
	if err != nil {
		return nil, err
	}

	return b.ByID(id)
}

// ByID returns a single budget by ID.
func (b *BudgetsStore) ByID(id string) (*models.Budget, error) {
	query := "SELECT id, category_id, month, amount_cents, created_at, updated_at FROM budgets WHERE id = ?"
	var budget models.Budget
	err := b.DB.QueryRow(query, id).Scan(&budget.ID, &budget.CategoryID, &budget.Month, &budget.AmountCents, &budget.CreatedAt, &budget.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("budget not found")
	}
	if err != nil {
		return nil, err
	}
	return &budget, nil
}

// Update modifies the amount_cents of an existing budget.
func (b *BudgetsStore) Update(id string, req models.UpdateBudgetReq) (*models.Budget, error) {
	_, err := b.ByID(id)
	if err != nil {
		return nil, err
	}

	now := time.Now().UTC().Format(time.RFC3339)
	_, err = b.DB.Exec("UPDATE budgets SET amount_cents = ?, updated_at = ? WHERE id = ?",
		req.AmountCents, now, id)
	if err != nil {
		return nil, err
	}

	return b.ByID(id)
}

// Delete removes a budget by ID.
func (b *BudgetsStore) Delete(id string) error {
	_, err := b.ByID(id)
	if err != nil {
		return err
	}
	_, err = b.DB.Exec("DELETE FROM budgets WHERE id = ?", id)
	return err
}

// Status returns budget status items for a given month.
//
// The result list contains:
//   - At most one global row (categoryId == nil), first in the slice, only
//     when a global budget exists for the month.
//   - One row per non-archived expense category, regardless of whether a
//     budget exists. Categories without a budget are returned as "orphan"
//     rows (BudgetID empty, BudgetCents 0) so the UI can render a "Create"
//     affordance for them.
//
// Status values: "on_track" (<80% used), "warning" (>=80% used), or
// "over" (spent exceeds budget). Orphans are always "on_track".
func (b *BudgetsStore) Status(month string) ([]models.BudgetStatusItem, error) {
	from := month + "-01"
	t, err := time.Parse("2006-01", month)
	if err != nil {
		return nil, fmt.Errorf("invalid month %q: %w", month, err)
	}
	to := t.AddDate(0, 1, -1).Format("2006-01-02")

	// 1. Load budgets for the month, splitting global from per-category.
	type budgetRow struct {
		ID         string
		CategoryID *string
		Amount     int
	}
	rows, err := b.DB.Query(`
		SELECT id, category_id, amount_cents FROM budgets WHERE month = ?`, month)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var globalBudget *budgetRow
	var perCategoryBudgets []budgetRow
	for rows.Next() {
		var br budgetRow
		var catID sql.NullString
		if err := rows.Scan(&br.ID, &catID, &br.Amount); err != nil {
			return nil, err
		}
		if catID.Valid {
			cid := catID.String
			br.CategoryID = &cid
			perCategoryBudgets = append(perCategoryBudgets, br)
		} else {
			globalBudget = &br
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	// 2. Load non-archived expense categories.
	type catRow struct {
		ID    string
		Name  string
		Color string
	}
	catRows, err := b.DB.Query(`
		SELECT id, name, color FROM categories
		WHERE kind = 'expense' AND archived = 0
		ORDER BY sort_order, name`)
	if err != nil {
		return nil, err
	}
	defer catRows.Close()

	var categories []catRow
	for catRows.Next() {
		var c catRow
		if err := catRows.Scan(&c.ID, &c.Name, &c.Color); err != nil {
			return nil, err
		}
		categories = append(categories, c)
	}
	if err := catRows.Err(); err != nil {
		return nil, err
	}

	// 3. Build results.
	results := make([]models.BudgetStatusItem, 0, 1+len(categories))

	// Global row first.
	if globalBudget != nil {
		var spent int
		if err := b.DB.QueryRow(`
			SELECT COALESCE(SUM(ABS(amount)), 0) FROM transactions
			WHERE kind = 'expense' AND date >= ? AND date <= ?`, from, to).Scan(&spent); err != nil {
			return nil, err
		}
		results = append(results, models.BudgetStatusItem{
			BudgetID:       globalBudget.ID,
			CategoryID:     nil,
			CategoryName:   "Pressupost global",
			Month:          month,
			BudgetCents:    globalBudget.Amount,
			SpentCents:     spent,
			RemainingCents: globalBudget.Amount - spent,
			Percent:        budgetPercent(spent, globalBudget.Amount),
			Status:         statusFor(globalBudget.Amount, spent),
		})
	}

	// Per-category rows: one per expense category, with or without budget.
	for _, cat := range categories {
		var br *budgetRow
		for i := range perCategoryBudgets {
			if perCategoryBudgets[i].CategoryID != nil && *perCategoryBudgets[i].CategoryID == cat.ID {
				br = &perCategoryBudgets[i]
				break
			}
		}

		var spent int
		if err := b.DB.QueryRow(`
			SELECT COALESCE(SUM(ABS(amount)), 0) FROM transactions
			WHERE category_id = ? AND kind = 'expense' AND date >= ? AND date <= ?`,
			cat.ID, from, to).Scan(&spent); err != nil {
			return nil, err
		}

		item := models.BudgetStatusItem{
			CategoryID:   &cat.ID,
			CategoryName: cat.Name,
			CategoryColor: cat.Color,
			Month:        month,
			SpentCents:   spent,
		}
		if br != nil {
			item.BudgetID = br.ID
			item.BudgetCents = br.Amount
			item.RemainingCents = br.Amount - spent
			item.Percent = budgetPercent(spent, br.Amount)
			item.Status = statusFor(br.Amount, spent)
		} else {
			// Orphan — no budget yet. Stay "on_track" with zeroed progress.
			item.Status = "on_track"
		}
		results = append(results, item)
	}

	return results, nil
}

// budgetPercent returns the percent of `budget` consumed by `spent`.
// Returns 0 when budget is 0 or negative (no budget set).
func budgetPercent(spent, budget int) float64 {
	if budget <= 0 {
		return 0
	}
	return float64(spent) / float64(budget) * 100
}

// statusFor maps a budget/spent pair to the enum used by the frontend:
//   - "over"     — spent exceeds budget
//   - "warning"  — at or above 80% of budget used
//   - "on_track" — everything else (including no budget)
func statusFor(budgetCents, spentCents int) string {
	if budgetCents > 0 && spentCents > budgetCents {
		return "over"
	}
	if budgetCents > 0 && float64(spentCents)/float64(budgetCents) >= 0.8 {
		return "warning"
	}
	return "on_track"
}