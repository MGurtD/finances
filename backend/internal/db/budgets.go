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

// Status returns budget status items with spending progress for a given month.
func (b *BudgetsStore) Status(month string) ([]models.BudgetStatusItem, error) {
	budgets, err := b.List(month)
	if err != nil {
		return nil, err
	}

	// Get spending per category for the month
	from := month + "-01"
	// Calculate last day of month
	t, err := time.Parse("2006-01", month)
	if err != nil {
		return nil, err
	}
	to := t.AddDate(0, 1, -1).Format("2006-01-02")

	var results []models.BudgetStatusItem
	for _, budget := range budgets {
		var spentCents int
		if budget.CategoryID != nil {
			err := b.DB.QueryRow(`
				SELECT COALESCE(SUM(ABS(amount)), 0) FROM transactions
				WHERE category_id = ? AND kind = 'expense' AND date >= ? AND date <= ?`,
				*budget.CategoryID, from, to).Scan(&spentCents)
			if err != nil {
				return nil, err
			}
		} else {
			// Global budget: sum all expenses for the month
			err := b.DB.QueryRow(`
				SELECT COALESCE(SUM(ABS(amount)), 0) FROM transactions
				WHERE kind = 'expense' AND date >= ? AND date <= ?`,
				from, to).Scan(&spentCents)
			if err != nil {
				return nil, err
			}
		}

		remaining := budget.AmountCents - spentCents
		var percentUsed float64
		if budget.AmountCents > 0 {
			percentUsed = float64(spentCents) / float64(budget.AmountCents) * 100
		}

		item := models.BudgetStatusItem{
			Budget:          budget,
			SpentCents:      spentCents,
			RemainingCents: remaining,
			PercentUsed:    percentUsed,
			OverBudget:     spentCents > budget.AmountCents,
		}
		results = append(results, item)
	}

	return results, nil
}