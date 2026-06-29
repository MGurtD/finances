package handlers

import (
	"net/http"
	"regexp"

	"github.com/gin-gonic/gin"
	"github.com/mgurt/finances/internal/apitypes"
	"github.com/mgurt/finances/internal/models"
)

// monthRe enforces YYYY-MM with month in 01..12. Compiled once at package
// load; the handler invokes it on every Upsert.
var monthRe = regexp.MustCompile(`^(\d{4})-(0[1-9]|1[0-2])$`)

// BudgetsHandler handles budget endpoints.
type BudgetsHandler struct {
	Server *apitypes.Server
}

// NewBudgetsHandler creates a new BudgetsHandler.
func NewBudgetsHandler(srv *apitypes.Server) *BudgetsHandler {
	return &BudgetsHandler{Server: srv}
}

// List godoc
// @Summary      List budgets
// @Description  List all budgets, optionally filtered by month
// @Tags         budgets
// @Produce      json
// @Param        month  query  string  false  "filter by month (YYYY-MM)"
// @Success      200  {array}  models.Budget
// @Failure      401  {object}  models.ErrorResponse
// @Router       /api/budgets [get]
// @Security     cookieAuth
func (h *BudgetsHandler) List(c *gin.Context) {
	month := c.Query("month")
	budgets, err := h.Server.Store.Budgets.List(month)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "failed to list budgets"})
		return
	}
	c.JSON(http.StatusOK, budgets)
}

// Upsert godoc
// @Summary      Upsert budget
// @Description  Create or update a budget (handles NULL categoryId for global budgets)
// @Tags         budgets
// @Accept       json
// @Produce      json
// @Param        body  body  models.UpsertBudgetReq  true  "budget data"
// @Success      200  {object}  models.Budget
// @Failure      400  {object}  models.ErrorResponse
// @Failure      401  {object}  models.ErrorResponse
// @Router       /api/budgets [post]
// @Security     cookieAuth
func (h *BudgetsHandler) Upsert(c *gin.Context) {
	var req models.UpsertBudgetReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "invalid request"})
		return
	}

	// Reject malformed month values up front. The DB row would otherwise
	// store "2026-13" verbatim and only fail later inside Status()'s
	// time.Parse, by which point the user has already lost the 400.
	if !monthRe.MatchString(req.Month) {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "month must be YYYY-MM"})
		return
	}

	budget, err := h.Server.Store.Budgets.Upsert(req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "failed to upsert budget"})
		return
	}
	c.JSON(http.StatusOK, budget)
}

// Update godoc
// @Summary      Update budget
// @Description  Update an existing budget's amount
// @Tags         budgets
// @Accept       json
// @Produce      json
// @Param        id  path  string  true  "budget ID"
// @Param        body  body  models.UpdateBudgetReq  true  "budget data"
// @Success      200  {object}  models.Budget
// @Failure      400  {object}  models.ErrorResponse
// @Failure      401  {object}  models.ErrorResponse
// @Failure      404  {object}  models.ErrorResponse
// @Router       /api/budgets/{id} [put]
// @Security     cookieAuth
func (h *BudgetsHandler) Update(c *gin.Context) {
	id := c.Param("id")
	var req models.UpdateBudgetReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "invalid request"})
		return
	}

	budget, err := h.Server.Store.Budgets.Update(id, req)
	if err != nil {
		c.JSON(http.StatusNotFound, models.ErrorResponse{Error: "budget not found"})
		return
	}
	c.JSON(http.StatusOK, budget)
}

// Delete godoc
// @Summary      Delete budget
// @Description  Delete a budget by ID
// @Tags         budgets
// @Produce      json
// @Param        id  path  string  true  "budget ID"
// @Success      200  {object}  map[string]string
// @Failure      401  {object}  models.ErrorResponse
// @Failure      404  {object}  models.ErrorResponse
// @Router       /api/budgets/{id} [delete]
// @Security     cookieAuth
func (h *BudgetsHandler) Delete(c *gin.Context) {
	id := c.Param("id")
	if err := h.Server.Store.Budgets.Delete(id); err != nil {
		c.JSON(http.StatusNotFound, models.ErrorResponse{Error: "budget not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// Status godoc
// @Summary      Get budget status
// @Description  Returns budget status items with spending progress for a given month
// @Tags         budgets
// @Produce      json
// @Param        month  query  string  true  "month (YYYY-MM)"
// @Success      200  {array}  models.BudgetStatusItem
// @Failure      400  {object}  models.ErrorResponse
// @Failure      401  {object}  models.ErrorResponse
// @Router       /api/budgets/status [get]
// @Security     cookieAuth
func (h *BudgetsHandler) Status(c *gin.Context) {
	month := c.Query("month")
	if month == "" {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "month is required"})
		return
	}

	status, err := h.Server.Store.Budgets.Status(month)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "failed to get budget status"})
		return
	}
	c.JSON(http.StatusOK, status)
}
