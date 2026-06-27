package db

import (
	"database/sql"
)

// Store wraps a *sql.DB connection and provides query methods for all entities.
type Store struct {
	DB        *sql.DB
	Accounts  *AccountsStore
	Categories *CategoriesStore
	Transactions *TransactionsStore
	Budgets   *BudgetsStore
	Dashboard *DashboardStore
}

// NewStore creates a new Store with the given database connection and sub-stores.
func NewStore(db *sql.DB) *Store {
	s := &Store{DB: db}
	s.Accounts = &AccountsStore{Store: s}
	s.Categories = &CategoriesStore{Store: s}
	s.Transactions = &TransactionsStore{Store: s}
	s.Budgets = &BudgetsStore{Store: s}
	s.Dashboard = &DashboardStore{Store: s}
	return s
}