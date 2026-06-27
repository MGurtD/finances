package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/mgurt/finances/internal/apitypes"
	"github.com/mgurt/finances/internal/db"
	"github.com/mgurt/finances/internal/models"
)

// CategoriesHandler handles category endpoints.
type CategoriesHandler struct {
	Server *apitypes.Server
}

// NewCategoriesHandler creates a new CategoriesHandler.
func NewCategoriesHandler(srv *apitypes.Server) *CategoriesHandler {
	return &CategoriesHandler{Server: srv}
}

// List godoc
// @Summary      List categories
// @Description  List all categories, optionally including archived
// @Tags         categories
// @Produce      json
// @Success      200  {array}  models.Category
// @Failure      401  {object}  models.ErrorResponse
// @Router       /api/categories [get]
// @Security     cookieAuth
func (h *CategoriesHandler) List(c *gin.Context) {
	categories, err := h.Server.Store.Categories.List(false)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "failed to list categories"})
		return
	}
	c.JSON(http.StatusOK, categories)
}

// Tree godoc
// @Summary      Get category tree
// @Description  Returns hierarchical category structure, optionally filtered by kind
// @Tags         categories
// @Produce      json
// @Param        kind  query  string  false  "filter by kind (income|expense)"
// @Success      200  {array}  models.CategoryNode
// @Failure      401  {object}  models.ErrorResponse
// @Router       /api/categories/tree [get]
// @Security     cookieAuth
func (h *CategoriesHandler) Tree(c *gin.Context) {
	kind := c.Query("kind")
	tree, err := h.Server.Store.Categories.Tree(kind)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "failed to get category tree"})
		return
	}
	c.JSON(http.StatusOK, tree)
}

// ByID godoc
// @Summary      Get category by ID
// @Description  Retrieve a single category by its ID
// @Tags         categories
// @Produce      json
// @Param        id  path  string  true  "category ID"
// @Success      200  {object}  models.Category
// @Failure      401  {object}  models.ErrorResponse
// @Failure      404  {object}  models.ErrorResponse
// @Router       /api/categories/{id} [get]
// @Security     cookieAuth
func (h *CategoriesHandler) ByID(c *gin.Context) {
	id := c.Param("id")
	category, err := h.Server.Store.Categories.ByID(id)
	if err != nil {
		c.JSON(http.StatusNotFound, models.ErrorResponse{Error: "category not found"})
		return
	}
	c.JSON(http.StatusOK, category)
}

// Create godoc
// @Summary      Create category
// @Description  Create a new category
// @Tags         categories
// @Accept       json
// @Produce      json
// @Param        body  body  models.CreateCategoryReq  true  "category data"
// @Success      201  {object}  models.Category
// @Failure      400  {object}  models.ErrorResponse
// @Failure      401  {object}  models.ErrorResponse
// @Router       /api/categories [post]
// @Security     cookieAuth
func (h *CategoriesHandler) Create(c *gin.Context) {
	var req models.CreateCategoryReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "invalid request"})
		return
	}

	createReq := db.CreateCategoryReq{
		Name:     req.Name,
		Kind:     req.Kind,
		ParentID: req.ParentID,
		Icon:     req.Icon,
		Color:    req.Color,
	}

	category, err := h.Server.Store.Categories.Create(createReq)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "failed to create category"})
		return
	}
	c.JSON(http.StatusCreated, category)
}

// Update godoc
// @Summary      Update category
// @Description  Update an existing category
// @Tags         categories
// @Accept       json
// @Produce      json
// @Param        id  path  string  true  "category ID"
// @Param        body  body  models.UpdateCategoryReq  true  "category data"
// @Success      200  {object}  models.Category
// @Failure      400  {object}  models.ErrorResponse
// @Failure      401  {object}  models.ErrorResponse
// @Failure      404  {object}  models.ErrorResponse
// @Router       /api/categories/{id} [put]
// @Security     cookieAuth
func (h *CategoriesHandler) Update(c *gin.Context) {
	id := c.Param("id")
	var req models.UpdateCategoryReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "invalid request"})
		return
	}

	updateReq := db.UpdateCategoryReq{
		Name:     req.Name,
		Kind:     req.Kind,
		ParentID: req.ParentID,
		Icon:     req.Icon,
		Color:    req.Color,
	}

	category, err := h.Server.Store.Categories.Update(id, updateReq)
	if err != nil {
		c.JSON(http.StatusNotFound, models.ErrorResponse{Error: "category not found"})
		return
	}
	c.JSON(http.StatusOK, category)
}

// Archive godoc
// @Summary      Archive category
// @Description  Archive a category (soft delete)
// @Tags         categories
// @Produce      json
// @Param        id  path  string  true  "category ID"
// @Success      200  {object}  models.Category
// @Failure      401  {object}  models.ErrorResponse
// @Failure      404  {object}  models.ErrorResponse
// @Router       /api/categories/{id}/archive [patch]
// @Security     cookieAuth
func (h *CategoriesHandler) Archive(c *gin.Context) {
	id := c.Param("id")
	if err := h.Server.Store.Categories.Archive(id); err != nil {
		c.JSON(http.StatusNotFound, models.ErrorResponse{Error: "category not found"})
		return
	}
	category, _ := h.Server.Store.Categories.ByID(id)
	c.JSON(http.StatusOK, category)
}

// Reorder godoc
// @Summary      Reorder categories
// @Description  Update sort order of categories based on provided ID list
// @Tags         categories
// @Accept       json
// @Produce      json
// @Param        body  body  models.ReorderReq  true  "ordered category IDs"
// @Success      200  {object}  map[string]string
// @Failure      400  {object}  models.ErrorResponse
// @Failure      401  {object}  models.ErrorResponse
// @Router       /api/categories/reorder [post]
// @Security     cookieAuth
func (h *CategoriesHandler) Reorder(c *gin.Context) {
	var req models.ReorderReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "invalid request"})
		return
	}
	if err := h.Server.Store.Categories.Reorder(req.Order); err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "failed to reorder categories"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}