package handlers

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/mgurt/finances/internal/apitypes"
	"github.com/mgurt/finances/internal/db"
	"github.com/mgurt/finances/internal/models"
)

// TransactionsHandler handles transaction endpoints.
type TransactionsHandler struct {
	Server *apitypes.Server
}

// NewTransactionsHandler creates a new TransactionsHandler.
func NewTransactionsHandler(srv *apitypes.Server) *TransactionsHandler {
	return &TransactionsHandler{Server: srv}
}

// List godoc
// @Summary      List transactions
// @Description  List transactions with optional filters (accountId, categoryId, kind, search, from, to, limit, offset)
// @Tags         transactions
// @Produce      json
// @Param        accountId   query  string  false  "filter by account ID"
// @Param        categoryId  query  string  false  "filter by category ID"
// @Param        kind        query  string  false  "filter by kind (income|expense|transfer)"
// @Param        search      query  string  false  "search in description and notes"
// @Param        from        query  string  false  "start date (YYYY-MM-DD)"
// @Param        to          query  string  false  "end date (YYYY-MM-DD)"
// @Param        limit       query  int     false  "maximum results"
// @Param        offset      query  int     false  "result offset"
// @Success      200  {array}  models.Transaction
// @Failure      401  {object}  models.ErrorResponse
// @Router       /api/transactions [get]
// @Security     cookieAuth
func (h *TransactionsHandler) List(c *gin.Context) {
	filters := db.TransactionFilters{
		AccountID:  c.Query("accountId"),
		CategoryID: c.Query("categoryId"),
		Kind:       c.Query("kind"),
		Search:     c.Query("search"),
		From:       c.Query("from"),
		To:         c.Query("to"),
	}
	if limitStr := c.Query("limit"); limitStr != "" {
		filters.Limit, _ = strconv.Atoi(limitStr)
	}
	if offsetStr := c.Query("offset"); offsetStr != "" {
		filters.Offset, _ = strconv.Atoi(offsetStr)
	}

	transactions, err := h.Server.Store.Transactions.List(filters)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "failed to list transactions"})
		return
	}
	c.JSON(http.StatusOK, transactions)
}

// ByID godoc
// @Summary      Get transaction by ID
// @Description  Retrieve a single transaction by its ID
// @Tags         transactions
// @Produce      json
// @Param        id  path  string  true  "transaction ID"
// @Success      200  {object}  models.Transaction
// @Failure      401  {object}  models.ErrorResponse
// @Failure      404  {object}  models.ErrorResponse
// @Router       /api/transactions/{id} [get]
// @Security     cookieAuth
func (h *TransactionsHandler) ByID(c *gin.Context) {
	id := c.Param("id")
	tx, err := h.Server.Store.Transactions.ByID(id)
	if err != nil {
		c.JSON(http.StatusNotFound, models.ErrorResponse{Error: "transaction not found"})
		return
	}
	c.JSON(http.StatusOK, tx)
}

// Create godoc
// @Summary      Create transaction
// @Description  Create a new transaction
// @Tags         transactions
// @Accept       json
// @Produce      json
// @Param        body  body  models.CreateTransactionReq  true  "transaction data"
// @Success      201  {object}  models.Transaction
// @Failure      400  {object}  models.ErrorResponse
// @Failure      401  {object}  models.ErrorResponse
// @Router       /api/transactions [post]
// @Security     cookieAuth
func (h *TransactionsHandler) Create(c *gin.Context) {
	var req models.CreateTransactionReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "invalid request"})
		return
	}

	tx, err := h.Server.Store.Transactions.Create(req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "failed to create transaction"})
		return
	}
	c.JSON(http.StatusCreated, tx)
}

// Update godoc
// @Summary      Update transaction
// @Description  Update an existing transaction
// @Tags         transactions
// @Accept       json
// @Produce      json
// @Param        id  path  string  true  "transaction ID"
// @Param        body  body  models.UpdateTransactionReq  true  "transaction data"
// @Success      200  {object}  models.Transaction
// @Failure      400  {object}  models.ErrorResponse
// @Failure      401  {object}  models.ErrorResponse
// @Failure      404  {object}  models.ErrorResponse
// @Router       /api/transactions/{id} [put]
// @Security     cookieAuth
func (h *TransactionsHandler) Update(c *gin.Context) {
	id := c.Param("id")
	var req models.UpdateTransactionReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "invalid request"})
		return
	}

	tx, err := h.Server.Store.Transactions.Update(id, req)
	if err != nil {
		c.JSON(http.StatusNotFound, models.ErrorResponse{Error: "transaction not found"})
		return
	}
	c.JSON(http.StatusOK, tx)
}

// Delete godoc
// @Summary      Delete transaction
// @Description  Delete a transaction by ID
// @Tags         transactions
// @Produce      json
// @Param        id  path  string  true  "transaction ID"
// @Success      200  {object}  map[string]string
// @Failure      401  {object}  models.ErrorResponse
// @Failure      404  {object}  models.ErrorResponse
// @Router       /api/transactions/{id} [delete]
// @Security     cookieAuth
func (h *TransactionsHandler) Delete(c *gin.Context) {
	id := c.Param("id")
	if err := h.Server.Store.Transactions.Delete(id); err != nil {
		c.JSON(http.StatusNotFound, models.ErrorResponse{Error: "transaction not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// HasAny godoc
// @Summary      Check if any transactions exist
// @Description  Returns true if there is at least one transaction
// @Tags         transactions
// @Produce      json
// @Success      200  {object}  map[string]bool
// @Failure      401  {object}  models.ErrorResponse
// @Router       /api/transactions/has-any [get]
// @Security     cookieAuth
func (h *TransactionsHandler) HasAny(c *gin.Context) {
	hasAny, err := h.Server.Store.Transactions.HasAny()
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "failed to check transactions"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"hasAny": hasAny})
}

// BulkCreate godoc
// @Summary      Bulk create transactions
// @Description  Create multiple transactions with SHA256 import hash deduplication
// @Tags         transactions
// @Accept       json
// @Produce      json
// @Param        body  body  models.BulkCreateReq  true  "transactions to create"
// @Success      200  {object}  map[string]int
// @Failure      400  {object}  models.ErrorResponse
// @Failure      401  {object}  models.ErrorResponse
// @Router       /api/transactions/bulk [post]
// @Security     cookieAuth
func (h *TransactionsHandler) BulkCreate(c *gin.Context) {
	var req models.BulkCreateReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "invalid request"})
		return
	}

	inserted, skipped, err := h.Server.Store.Transactions.BulkCreate(req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "failed to create transactions"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"inserted": inserted, "skipped": skipped})
}

// BulkDelete godoc
// @Summary      Bulk delete transactions
// @Description  Delete multiple transactions by ID in a single atomic SQL statement.
// @Description  Returns the number of rows actually deleted (may be < len(ids) if some IDs no longer exist).
// @Tags         transactions
// @Accept       json
// @Produce      json
// @Param        body  body  models.BulkDeleteReq  true  "transaction IDs to delete"
// @Success      200  {object}  models.BulkDeleteResult
// @Failure      400  {object}  models.ErrorResponse
// @Failure      401  {object}  models.ErrorResponse
// @Router       /api/transactions/bulk-delete [post]
// @Security     cookieAuth
func (h *TransactionsHandler) BulkDelete(c *gin.Context) {
	var req models.BulkDeleteReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "invalid request"})
		return
	}

	n, err := h.Server.Store.Transactions.BulkDelete(req.IDs)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "failed to delete transactions"})
		return
	}
	c.JSON(http.StatusOK, models.BulkDeleteResult{Deleted: n})
}

// Recent godoc
// @Summary      Get recent transactions
// @Description  Returns most recent transactions with account and category names
// @Tags         transactions
// @Produce      json
// @Param        accountId  query  string  false  "filter by account ID"
// @Param        limit      query  int     false  "maximum results (default 10)"
// @Success      200  {array}  models.TransactionWithDetails
// @Failure      401  {object}  models.ErrorResponse
// @Router       /api/transactions/recent [get]
// @Security     cookieAuth
func (h *TransactionsHandler) Recent(c *gin.Context) {
	limit := 10
	if limitStr := c.Query("limit"); limitStr != "" {
		limit, _ = strconv.Atoi(limitStr)
	}

	recent, err := h.Server.Store.Transactions.Recent(limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "failed to get recent transactions"})
		return
	}
	c.JSON(http.StatusOK, recent)
}

// SummaryByMonth godoc
// @Summary      Get monthly summary
// @Description  Returns income, expense, net and count per month
// @Tags         transactions
// @Produce      json
// @Param        months  query  int  false  "number of months to return (default 12)"
// @Success      200  {array}  models.SummaryByMonthItem
// @Failure      401  {object}  models.ErrorResponse
// @Router       /api/transactions/summary-by-month [get]
// @Security     cookieAuth
func (h *TransactionsHandler) SummaryByMonth(c *gin.Context) {
	months := 12
	if monthsStr := c.Query("months"); monthsStr != "" {
		months, _ = strconv.Atoi(monthsStr)
	}

	summary, err := h.Server.Store.Transactions.SummaryByMonth(months)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "failed to get summary"})
		return
	}
	c.JSON(http.StatusOK, summary)
}

// SummaryByCategory godoc
// @Summary      Get category summary
// @Description  Returns total and count per category for a date range
// @Tags         transactions
// @Produce      json
// @Param        from   query  string  true  "start date (YYYY-MM-DD)"
// @Param        to     query  string  true  "end date (YYYY-MM-DD)"
// @Param        accountId  query  string  false  "filter by account ID"
// @Success      200  {array}  models.SummaryByCategoryItem
// @Failure      400  {object}  models.ErrorResponse
// @Failure      401  {object}  models.ErrorResponse
// @Router       /api/transactions/summary-by-category [get]
// @Security     cookieAuth
func (h *TransactionsHandler) SummaryByCategory(c *gin.Context) {
	from := c.Query("from")
	to := c.Query("to")
	if from == "" || to == "" {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "from and to are required"})
		return
	}

	summary, err := h.Server.Store.Transactions.SummaryByCategory(from, to)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "failed to get summary"})
		return
	}
	c.JSON(http.StatusOK, summary)
}