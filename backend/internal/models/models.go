package models

import (
	"encoding/json"
	"fmt"
	"time"
)

// BoolInt is a custom type for SQLite INTEGER (0/1) to Go bool JSON marshaling.
// SQLite stores booleans as integers 0/1. This type marshals to JSON as true/false
// and round-trips through JSON via UnmarshalJSON.
type BoolInt int

// MarshalJSON converts BoolInt to JSON boolean.
func (b BoolInt) MarshalJSON() ([]byte, error) {
	return boolJSON(b != 0)
}

// UnmarshalJSON accepts JSON booleans (true|false) or JSON numbers (0|1)
// and stores 0 or 1 in *b. Anything else returns an error and leaves *b
// unchanged. Symmetric with MarshalJSON so a JSON byte stream produced by
// a Postgres-style boolean ("archived":true) round-trips into SQLite
// storage as INTEGER 1.
func (b *BoolInt) UnmarshalJSON(data []byte) error {
	var v any
	if err := json.Unmarshal(data, &v); err != nil {
		return err
	}
	switch x := v.(type) {
	case bool:
		if x {
			*b = 1
		} else {
			*b = 0
		}
	case float64:
		if x == 0 {
			*b = 0
		} else if x == 1 {
			*b = 1
		} else {
			return fmt.Errorf("BoolInt: cannot unmarshal %v into BoolInt (only 0|1)", x)
		}
	default:
		return fmt.Errorf("BoolInt: cannot unmarshal %s into BoolInt", string(data))
	}
	return nil
}

func boolJSON(b bool) ([]byte, error) {
	if b {
		return []byte("true"), nil
	}
	return []byte("false"), nil
}

// Account represents a financial account.
type Account struct {
	ID             string  `json:"id"`
	Name           string  `json:"name"`
	Type           string  `json:"type"` // checking|savings|credit_card|cash|investment
	Currency       string  `json:"currency"`
	Color          string  `json:"color"`
	Icon           string  `json:"icon"`
	InitialBalance int     `json:"initialBalance"`
	SortOrder      int     `json:"sortOrder"`
	Archived       BoolInt `json:"archived"`
	CreatedAt      string  `json:"createdAt"`
	UpdatedAt      string  `json:"updatedAt"`
}

// CreateAccountReq is the request body for POST /accounts.
type CreateAccountReq struct {
	Name           string `json:"name" binding:"required"`
	Type           string `json:"type" binding:"required"`
	Color          string `json:"color"`
	Icon           string `json:"icon"`
	InitialBalance int    `json:"initialBalance"`
	Currency       string `json:"currency"`
}

// UpdateAccountReq is the request body for PUT /accounts/:id.
type UpdateAccountReq struct {
	Name  string `json:"name"`
	Type  string `json:"type"`
	Color string `json:"color"`
	Icon  string `json:"icon"`
}

// AccountWithBalance combines an account with its current balance.
type AccountWithBalance struct {
	Account
	Balance int `json:"balance"`
}

// Category represents a transaction category.
type Category struct {
	ID        string  `json:"id"`
	Name      string  `json:"name"`
	Kind      string  `json:"kind"` // income|expense
	ParentID  *string `json:"parentId"`
	Icon      string  `json:"icon"`
	Color     string  `json:"color"`
	SortOrder int     `json:"sortOrder"`
	Archived  BoolInt `json:"archived"`
	CreatedAt string  `json:"createdAt"`
}

// CreateCategoryReq is the request body for POST /categories.
type CreateCategoryReq struct {
	Name     string  `json:"name" binding:"required"`
	Kind     string  `json:"kind" binding:"required"` // income|expense
	ParentID *string `json:"parentId"`
	Icon     string  `json:"icon"`
	Color    string  `json:"color"`
}

// UpdateCategoryReq is the request body for PUT /categories/:id.
type UpdateCategoryReq struct {
	Name     string  `json:"name"`
	Kind     string  `json:"kind"`
	ParentID *string `json:"parentId"`
	Icon     string  `json:"icon"`
	Color    string  `json:"color"`
}

// CategoryNode is a category with its children for tree representation.
type CategoryNode struct {
	Category
	Children []CategoryNode `json:"children,omitempty"`
}

// Transaction represents a financial transaction.
type Transaction struct {
	ID                string  `json:"id"`
	AccountID         string  `json:"accountId"`
	CategoryID        *string `json:"categoryId"`
	Kind              string  `json:"kind"` // income|expense|transfer
	Amount            int     `json:"amount"`
	Description       string  `json:"description"`
	Notes             string  `json:"notes"`
	Date              string  `json:"date"`
	ImportHash        *string `json:"importHash"`
	TransferAccountID *string `json:"transferAccountId"`
	CreatedAt         string  `json:"createdAt"`
	UpdatedAt         string  `json:"updatedAt"`
}

// CreateTransactionReq is the request body for POST /transactions.
type CreateTransactionReq struct {
	AccountID         string  `json:"accountId" binding:"required"`
	CategoryID        *string `json:"categoryId"`
	Kind              string  `json:"kind" binding:"required"`
	Amount            int     `json:"amount" binding:"required"`
	Description       string  `json:"description"`
	Notes             string  `json:"notes"`
	Date              string  `json:"date" binding:"required"`
	ImportHash        *string `json:"importHash"`
	TransferAccountID *string `json:"transferAccountId"`
}

// UpdateTransactionReq is the request body for PUT /transactions/:id.
type UpdateTransactionReq struct {
	CategoryID        *string `json:"categoryId"`
	Kind              string  `json:"kind"`
	Amount            int     `json:"amount"`
	Description       string  `json:"description"`
	Notes             string  `json:"notes"`
	Date              string  `json:"date"`
	TransferAccountID *string `json:"transferAccountId"`
}

// TransactionWithDetails includes account and category names for display.
type TransactionWithDetails struct {
	Transaction
	AccountName         string `json:"accountName"`
	CategoryName        string `json:"categoryName,omitempty"`
	TransferAccountName string `json:"transferAccountName,omitempty"`
}

// BulkCreateItem is one item in a bulk create request.
type BulkCreateItem struct {
	AccountID         string  `json:"accountId" binding:"required"`
	CategoryID        *string `json:"categoryId"`
	Kind              string  `json:"kind" binding:"required"`
	Amount            int     `json:"amount" binding:"required"`
	Description       string  `json:"description"`
	Notes             string  `json:"notes"`
	Date              string  `json:"date" binding:"required"`
	ImportHash        *string `json:"importHash"`
	TransferAccountID *string `json:"transferAccountId"`
}

// BulkCreateReq is the request body for POST /transactions/bulk.
type BulkCreateReq struct {
	Transactions []BulkCreateItem `json:"transactions" binding:"required"`
}

// BulkDeleteReq is the request body for POST /transactions/bulk-delete.
type BulkDeleteReq struct {
	IDs []string `json:"ids" binding:"required,min=1,max=1000"`
}

// BulkDeleteResult mirrors BulkCreate's response shape (deleted count).
type BulkDeleteResult struct {
	Deleted int `json:"deleted"`
}

// Budget represents a monthly budget.
type Budget struct {
	ID          string  `json:"id"`
	CategoryID  *string `json:"categoryId"`
	Month       string  `json:"month"` // YYYY-MM
	AmountCents int     `json:"amountCents"`
	CreatedAt   string  `json:"createdAt"`
	UpdatedAt   string  `json:"updatedAt"`
}

// UpsertBudgetReq is the request body for POST /budgets/upsert.
type UpsertBudgetReq struct {
	CategoryID  *string `json:"categoryId"`
	Month       string  `json:"month" binding:"required"`
	AmountCents int     `json:"amountCents" binding:"required"`
}

// UpdateBudgetReq is the request body for PUT /budgets/:id.
type UpdateBudgetReq struct {
	AmountCents int `json:"amountCents"`
}

// BudgetStatusItem shows spending progress for one budget or for one
// expense category that has no budget yet (orphan row). For orphans,
// BudgetID is empty and BudgetCents is 0 — the UI uses these as the
// signal to render a "Create" form instead of "Update".
type BudgetStatusItem struct {
	BudgetID       string  `json:"budgetId"`   // empty for orphans
	CategoryID     *string `json:"categoryId"` // nil for global
	CategoryName   string  `json:"categoryName"`
	CategoryColor  string  `json:"categoryColor,omitempty"` // empty for global
	Month          string  `json:"month"`
	BudgetCents    int     `json:"budgetCents"` // 0 for orphans
	SpentCents     int     `json:"spentCents"`
	RemainingCents int     `json:"remainingCents"`
	Percent        float64 `json:"percent"` // 0 for orphans
	Status         string  `json:"status"`  // on_track | warning | over
}

// ErrorResponse is the standard error payload.
type ErrorResponse struct {
	Error string `json:"error"`
}

// HealthResponse is the response for GET /health.
type HealthResponse struct {
	Status    string `json:"status"`
	Version   string `json:"version"`
	Uptime    string `json:"uptime"`
	Timestamp string `json:"timestamp"`
}

// AuthStatusResponse is the response for GET /auth/status.
type AuthStatusResponse struct {
	Authenticated bool    `json:"authenticated"`
	IssuedAt      *string `json:"issuedAt,omitempty"`
}

// LoginReq is the request body for POST /auth/login.
type LoginReq struct {
	Password string `json:"password" binding:"required"`
}

// ReorderReq is the request body for POST /accounts/reorder or /categories/reorder.
type ReorderReq struct {
	Order []string `json:"order" binding:"required"`
}

// SummaryByMonthItem is one row in the monthly summary.
// Money fields are integer cents — the JSON name carries the unit so
// downstream consumers don't accidentally treat the value as euros.
type SummaryByMonthItem struct {
	Month        string `json:"month"`
	IncomeCents  int    `json:"incomeCents"`
	ExpenseCents int    `json:"expenseCents"`
	NetCents     int    `json:"netCents"`
	Count        int    `json:"count"`
}

// SummaryByCategoryItem is one row in the category summary.
type SummaryByCategoryItem struct {
	CategoryID   *string `json:"categoryId"`
	CategoryName string  `json:"categoryName,omitempty"`
	Total        int     `json:"total"`
	Count        int     `json:"count"`
}

// DashboardSummary is the response for GET /dashboard/summary.
// Money fields are integer cents — JSON tag carries the unit so the
// frontend never confuses cents for euros.
type DashboardSummary struct {
	IncomeCents      int                     `json:"incomeCents"`
	ExpenseCents     int                     `json:"expenseCents"`
	NetSavingsCents  int                     `json:"netSavingsCents"`
	TransactionCount int                     `json:"transactionCount"`
	ByCategory       []SummaryByCategoryItem `json:"byCategory"`
}

// now is a helper to get current UTC ISO string.
func nowUTC() string {
	return time.Now().UTC().Format(time.RFC3339)
}
