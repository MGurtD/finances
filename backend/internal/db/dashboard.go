package db

import (
	"github.com/mgurt/finances/internal/models"
)

// DashboardStore provides query methods for dashboard summaries.
type DashboardStore struct {
	*Store
}

// Summary returns income, expense, net, count, and by-category breakdown for a date range.
func (d *DashboardStore) Summary(from, to string) (*models.DashboardSummary, error) {
	// Get overall income/expense/net
	var income, expense, net int
	var count int

	err := d.DB.QueryRow(`
		SELECT
			COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) AS income,
			COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0) AS expense,
			COALESCE(SUM(amount), 0) AS net,
			COUNT(*) AS count
		FROM transactions
		WHERE date >= ? AND date <= ?`, from, to).Scan(&income, &expense, &net, &count)
	if err != nil {
		return nil, err
	}

	// Get by-category breakdown
	byCategory, err := d.Transactions.SummaryByCategory(from, to)
	if err != nil {
		return nil, err
	}

	return &models.DashboardSummary{
		IncomeCents:      income,
		ExpenseCents:     expense,
		NetSavingsCents:  net,
		TransactionCount: count,
		ByCategory:       byCategory,
	}, nil
}