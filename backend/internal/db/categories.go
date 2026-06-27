package db

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/mgurt/finances/internal/models"
)

// CreateCategoryReq is the input for creating a category.
type CreateCategoryReq struct {
	Name     string
	Kind     string // income|expense
	ParentID *string
	Icon     string
	Color    string
}

// UpdateCategoryReq is the input for updating a category.
type UpdateCategoryReq struct {
	Name     string
	Kind     string
	ParentID *string
	Icon     string
	Color    string
}

// CategoriesStore provides query methods for categories.
type CategoriesStore struct {
	*Store
}

// List returns all categories, optionally excluding archived.
func (c *CategoriesStore) List(includeArchived bool) ([]models.Category, error) {
	query := "SELECT id, name, kind, parent_id, icon, color, sort_order, archived, created_at FROM categories"
	if !includeArchived {
		query += " WHERE archived = 0"
	}
	query += " ORDER BY sort_order ASC, created_at ASC"

	rows, err := c.DB.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var categories []models.Category
	for rows.Next() {
		var cat models.Category
		err := rows.Scan(&cat.ID, &cat.Name, &cat.Kind, &cat.ParentID, &cat.Icon, &cat.Color, &cat.SortOrder, &cat.Archived, &cat.CreatedAt)
		if err != nil {
			return nil, err
		}
		categories = append(categories, cat)
	}
	return categories, rows.Err()
}

// ByID returns a single category by ID.
func (c *CategoriesStore) ByID(id string) (*models.Category, error) {
	query := "SELECT id, name, kind, parent_id, icon, color, sort_order, archived, created_at FROM categories WHERE id = ?"
	var cat models.Category
	err := c.DB.QueryRow(query, id).Scan(&cat.ID, &cat.Name, &cat.Kind, &cat.ParentID, &cat.Icon, &cat.Color, &cat.SortOrder, &cat.Archived, &cat.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("category not found")
	}
	if err != nil {
		return nil, err
	}
	return &cat, nil
}

// Tree returns a hierarchical category structure built in-memory.
func (c *CategoriesStore) Tree(kind string) ([]models.CategoryNode, error) {
	includeArchived := false
	categories, err := c.List(includeArchived)
	if err != nil {
		return nil, err
	}

	// Filter by kind if provided
	if kind != "" {
		var filtered []models.Category
		for _, cat := range categories {
			if cat.Kind == kind {
				filtered = append(filtered, cat)
			}
		}
		categories = filtered
	}

	// Build parent->children map
	childrenMap := make(map[string][]models.Category)
	for _, cat := range categories {
		if cat.ParentID != nil {
			childrenMap[*cat.ParentID] = append(childrenMap[*cat.ParentID], cat)
		}
	}

	// Find root nodes (no parent) and build tree recursively
	var roots []models.CategoryNode
	for _, cat := range categories {
		if cat.ParentID == nil {
			roots = append(roots, buildNode(cat, childrenMap))
		}
	}

	return roots, nil
}

func buildNode(cat models.Category, childrenMap map[string][]models.Category) models.CategoryNode {
	node := models.CategoryNode{Category: cat}
	children := childrenMap[cat.ID]
	for _, child := range children {
		node.Children = append(node.Children, buildNode(child, childrenMap))
	}
	return node
}

// Create inserts a new category and returns it.
func (c *CategoriesStore) Create(req CreateCategoryReq) (*models.Category, error) {
	id := uuid.New().String()
	now := time.Now().UTC().Format(time.RFC3339)
	icon := req.Icon
	if icon == "" {
		icon = "tag"
	}
	color := req.Color
	if color == "" {
		color = "#8B7355"
	}

	_, err := c.DB.Exec(`
		INSERT INTO categories (id, name, kind, parent_id, icon, color, sort_order, archived, created_at)
		VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?)`,
		id, req.Name, req.Kind, req.ParentID, icon, color, now)
	if err != nil {
		return nil, err
	}

	return c.ByID(id)
}

// Update modifies an existing category and returns it.
func (c *CategoriesStore) Update(id string, req UpdateCategoryReq) (*models.Category, error) {
	existing, err := c.ByID(id)
	if err != nil {
		return nil, err
	}

	name := req.Name
	if name == "" {
		name = existing.Name
	}
	kind := req.Kind
	if kind == "" {
		kind = existing.Kind
	}
	parentID := req.ParentID
	if parentID == nil {
		parentID = existing.ParentID
	}
	icon := req.Icon
	if icon == "" {
		icon = existing.Icon
	}
	color := req.Color
	if color == "" {
		color = existing.Color
	}

	_, err = c.DB.Exec("UPDATE categories SET name = ?, kind = ?, parent_id = ?, icon = ?, color = ? WHERE id = ?",
		name, kind, parentID, icon, color, id)
	if err != nil {
		return nil, err
	}

	return c.ByID(id)
}

// Archive sets archived=1 for the given category.
func (c *CategoriesStore) Archive(id string) error {
	result, err := c.DB.Exec("UPDATE categories SET archived = 1 WHERE id = ?", id)
	if err != nil {
		return err
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return fmt.Errorf("category not found")
	}
	return nil
}

// Reorder updates sort_order for categories based on the provided ID order.
func (c *CategoriesStore) Reorder(order []string) error {
	if len(order) == 0 {
		return nil
	}

	tx, err := c.DB.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	for i, id := range order {
		_, err := tx.Exec("UPDATE categories SET sort_order = ? WHERE id = ?", i, id)
		if err != nil {
			return err
		}
	}

	return tx.Commit()
}