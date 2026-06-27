package handlers

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/mgurt/finances/internal/apitypes"
	"github.com/mgurt/finances/internal/db"
	"github.com/mgurt/finances/internal/models"
)

// AccountsHandler handles account endpoints.
type AccountsHandler struct {
	Server *apitypes.Server
}

// NewAccountsHandler creates a new AccountsHandler.
func NewAccountsHandler(srv *apitypes.Server) *AccountsHandler {
	return &AccountsHandler{Server: srv}
}

// List godoc
// @Summary      List accounts
// @Description  List all accounts, optionally including archived
// @Tags         accounts
// @Produce      json
// @Param        includeArchived  query  bool  false  "include archived accounts"
// @Success      200  {array}  models.Account
// @Failure      401  {object}  models.ErrorResponse
// @Router       /api/accounts [get]
// @Security     cookieAuth
func (h *AccountsHandler) List(c *gin.Context) {
	includeArchived, _ := strconv.ParseBool(c.Query("includeArchived"))
	accounts, err := h.Server.Store.Accounts.List(includeArchived)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "failed to list accounts"})
		return
	}
	c.JSON(http.StatusOK, accounts)
}

// ByID godoc
// @Summary      Get account by ID
// @Description  Retrieve a single account by its ID
// @Tags         accounts
// @Produce      json
// @Param        id  path  string  true  "account ID"
// @Success      200  {object}  models.Account
// @Failure      401  {object}  models.ErrorResponse
// @Failure      404  {object}  models.ErrorResponse
// @Router       /api/accounts/{id} [get]
// @Security     cookieAuth
func (h *AccountsHandler) ByID(c *gin.Context) {
	id := c.Param("id")
	account, err := h.Server.Store.Accounts.ByID(id)
	if err != nil {
		c.JSON(http.StatusNotFound, models.ErrorResponse{Error: "account not found"})
		return
	}
	c.JSON(http.StatusOK, account)
}

// Create godoc
// @Summary      Create account
// @Description  Create a new account
// @Tags         accounts
// @Accept       json
// @Produce      json
// @Param        body  body  models.CreateAccountReq  true  "account data"
// @Success      201  {object}  models.Account
// @Failure      400  {object}  models.ErrorResponse
// @Failure      401  {object}  models.ErrorResponse
// @Router       /api/accounts [post]
// @Security     cookieAuth
func (h *AccountsHandler) Create(c *gin.Context) {
	var req models.CreateAccountReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "invalid request"})
		return
	}

	createReq := db.CreateAccountReq{
		Name:           req.Name,
		Type:           req.Type,
		Color:          req.Color,
		Icon:           req.Icon,
		InitialBalance: req.InitialBalance,
		Currency:       req.Currency,
	}

	account, err := h.Server.Store.Accounts.Create(createReq)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "failed to create account"})
		return
	}
	c.JSON(http.StatusCreated, account)
}

// Update godoc
// @Summary      Update account
// @Description  Update an existing account
// @Tags         accounts
// @Accept       json
// @Produce      json
// @Param        id  path  string  true  "account ID"
// @Param        body  body  models.UpdateAccountReq  true  "account data"
// @Success      200  {object}  models.Account
// @Failure      400  {object}  models.ErrorResponse
// @Failure      401  {object}  models.ErrorResponse
// @Failure      404  {object}  models.ErrorResponse
// @Router       /api/accounts/{id} [put]
// @Security     cookieAuth
func (h *AccountsHandler) Update(c *gin.Context) {
	id := c.Param("id")
	var req models.UpdateAccountReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "invalid request"})
		return
	}

	updateReq := db.UpdateAccountReq{
		Name:  req.Name,
		Type:  req.Type,
		Color: req.Color,
		Icon:  req.Icon,
	}

	account, err := h.Server.Store.Accounts.Update(id, updateReq)
	if err != nil {
		c.JSON(http.StatusNotFound, models.ErrorResponse{Error: "account not found"})
		return
	}
	c.JSON(http.StatusOK, account)
}

// Archive godoc
// @Summary      Archive account
// @Description  Archive an account (soft delete)
// @Tags         accounts
// @Produce      json
// @Param        id  path  string  true  "account ID"
// @Success      200  {object}  models.Account
// @Failure      401  {object}  models.ErrorResponse
// @Failure      404  {object}  models.ErrorResponse
// @Router       /api/accounts/{id}/archive [patch]
// @Security     cookieAuth
func (h *AccountsHandler) Archive(c *gin.Context) {
	id := c.Param("id")
	if err := h.Server.Store.Accounts.Archive(id); err != nil {
		c.JSON(http.StatusNotFound, models.ErrorResponse{Error: "account not found"})
		return
	}
	account, _ := h.Server.Store.Accounts.ByID(id)
	c.JSON(http.StatusOK, account)
}

// Delete godoc
// @Summary      Delete account
// @Description  Delete an account and all its transaction legs (cascade)
// @Tags         accounts
// @Produce      json
// @Param        id  path  string  true  "account ID"
// @Success      200  {object}  map[string]interface{}
// @Failure      401  {object}  models.ErrorResponse
// @Failure      404  {object}  models.ErrorResponse
// @Router       /api/accounts/{id} [delete]
// @Security     cookieAuth
func (h *AccountsHandler) Delete(c *gin.Context) {
	id := c.Param("id")
	count, err := h.Server.Store.Accounts.Delete(id)
	if err != nil {
		c.JSON(http.StatusNotFound, models.ErrorResponse{Error: "account not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"deleted": count})
}

// Reorder godoc
// @Summary      Reorder accounts
// @Description  Update sort order of accounts based on provided ID list
// @Tags         accounts
// @Accept       json
// @Produce      json
// @Param        body  body  models.ReorderReq  true  "ordered account IDs"
// @Success      200  {object}  map[string]string
// @Failure      400  {object}  models.ErrorResponse
// @Failure      401  {object}  models.ErrorResponse
// @Router       /api/accounts/reorder [post]
// @Security     cookieAuth
func (h *AccountsHandler) Reorder(c *gin.Context) {
	var req models.ReorderReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "invalid request"})
		return
	}
	if err := h.Server.Store.Accounts.Reorder(req.Order); err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "failed to reorder accounts"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// Balances godoc
// @Summary      Get account balances
// @Description  Returns all accounts with their computed balances (initial + sum of transactions)
// @Tags         accounts
// @Produce      json
// @Success      200  {array}  models.AccountWithBalance
// @Failure      401  {object}  models.ErrorResponse
// @Router       /api/accounts/balances [get]
// @Security     cookieAuth
func (h *AccountsHandler) Balances(c *gin.Context) {
	balances, err := h.Server.Store.Accounts.Balances()
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "failed to get balances"})
		return
	}
	c.JSON(http.StatusOK, balances)
}