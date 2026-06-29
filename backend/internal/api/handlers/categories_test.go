package handlers_test

import (
	"net/http"
	"testing"

	"github.com/mgurt/finances/internal/api/testutil"
	"github.com/mgurt/finances/internal/models"
)

// --- TestCategories_List_HTTP ---------------------------------------------

func TestCategories_List_HTTP(t *testing.T) {
	t.Run("empty (unseeded) returns 200 with empty array", func(t *testing.T) {
		s := testutil.NewServer(t, testutil.WithSeeded(false))
		s.Cookie = s.Login(t)

		var resp []models.Category
		w := s.DoJSON(t, http.MethodGet, "/api/categories", nil, &resp)
		if w.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200", w.Code)
		}
		if len(resp) != 0 {
			t.Errorf("len = %d, want 0", len(resp))
		}
	})

	t.Run("seeded returns 200 with the default taxonomy", func(t *testing.T) {
		s, _ := loginAsAdmin(t)

		var resp []models.Category
		w := s.DoJSON(t, http.MethodGet, "/api/categories", nil, &resp)
		if w.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200", w.Code)
		}
		if len(resp) < 5 {
			t.Errorf("len = %d, want at least 5 (default taxonomy)", len(resp))
		}
	})

	t.Run("archived excluded by default", func(t *testing.T) {
		s, _ := loginAsAdmin(t)
		// Archive one category.
		id := s.SeededCategoryID(t, "Habitatge")
		w := s.DoJSON(t, http.MethodPatch, "/api/categories/"+id+"/archive", nil, nil)
		if w.Code != http.StatusOK {
			t.Fatalf("archive: %d", w.Code)
		}

		var resp []models.Category
		w = s.DoJSON(t, http.MethodGet, "/api/categories", nil, &resp)
		if w.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200", w.Code)
		}
		// Verify Habitatge is not in the response.
		for _, c := range resp {
			if c.Name == "Habitatge" {
				t.Error("archived category 'Habitatge' should be excluded")
			}
		}
	})

	t.Run("returns 401 without auth cookie", func(t *testing.T) {
		s := testutil.NewServer(t)
		w := s.DoJSON(t, http.MethodGet, "/api/categories", nil, nil)
		if w.Code != http.StatusUnauthorized {
			t.Errorf("status = %d, want 401", w.Code)
		}
	})
}

// --- TestCategories_Tree_HTTP ---------------------------------------------

func TestCategories_Tree_HTTP(t *testing.T) {
	t.Run("no filter returns hierarchical nodes", func(t *testing.T) {
		s, _ := loginAsAdmin(t)

		var resp []models.CategoryNode
		w := s.DoJSON(t, http.MethodGet, "/api/categories/tree", nil, &resp)
		if w.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200", w.Code)
		}
		if len(resp) < 5 {
			t.Errorf("len(roots) = %d, want at least 5 (default taxonomy)", len(resp))
		}
		// Find a parent that should have children. Seeded 'Transferències internes'
		// (id 214) has a child 'Entre comptes propis' (id 218).
		foundParentWithChild := false
		for _, node := range resp {
			if node.Name == "Transferències internes" && len(node.Children) > 0 {
				foundParentWithChild = true
				break
			}
		}
		if !foundParentWithChild {
			t.Error("expected 'Transferències internes' to have at least 1 child in the tree")
		}
	})

	t.Run("?kind=expense returns only expense categories", func(t *testing.T) {
		s, _ := loginAsAdmin(t)

		var resp []models.CategoryNode
		w := s.DoJSON(t, http.MethodGet, "/api/categories/tree?kind=expense", nil, &resp)
		if w.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200", w.Code)
		}
		for _, node := range resp {
			if node.Kind != "expense" {
				t.Errorf("node.kind = %q, want expense (filter leaked)", node.Kind)
			}
		}
	})

	t.Run("?kind=income returns only income categories", func(t *testing.T) {
		s, _ := loginAsAdmin(t)

		var resp []models.CategoryNode
		w := s.DoJSON(t, http.MethodGet, "/api/categories/tree?kind=income", nil, &resp)
		if w.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200", w.Code)
		}
		if len(resp) == 0 {
			t.Fatal("expected at least 1 income category in seed")
		}
		for _, node := range resp {
			if node.Kind != "income" {
				t.Errorf("node.kind = %q, want income", node.Kind)
			}
		}
	})

	t.Run("returns 401 without auth cookie", func(t *testing.T) {
		s := testutil.NewServer(t)
		w := s.DoJSON(t, http.MethodGet, "/api/categories/tree", nil, nil)
		if w.Code != http.StatusUnauthorized {
			t.Errorf("status = %d, want 401", w.Code)
		}
	})
}

// --- TestCategories_ByID_HTTP ----------------------------------------------

func TestCategories_ByID_HTTP(t *testing.T) {
	t.Run("valid id returns 200", func(t *testing.T) {
		s, _ := loginAsAdmin(t)
		id := s.SeededCategoryID(t, "Habitatge")

		var resp models.Category
		w := s.DoJSON(t, http.MethodGet, "/api/categories/"+id, nil, &resp)
		if w.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200", w.Code)
		}
		if resp.ID != id {
			t.Errorf("id = %q, want %q", resp.ID, id)
		}
	})

	t.Run("unknown id returns 404 {error:category not found}", func(t *testing.T) {
		s, _ := loginAsAdmin(t)
		var resp models.ErrorResponse
		w := s.DoJSON(t, http.MethodGet, "/api/categories/no-such-id", nil, &resp)
		if w.Code != http.StatusNotFound {
			t.Errorf("status = %d, want 404", w.Code)
		}
		if resp.Error != "category not found" {
			t.Errorf("error = %q, want 'category not found'", resp.Error)
		}
	})

	t.Run("returns 401 without auth cookie", func(t *testing.T) {
		s := testutil.NewServer(t)
		w := s.DoJSON(t, http.MethodGet, "/api/categories/any", nil, nil)
		if w.Code != http.StatusUnauthorized {
			t.Errorf("status = %d, want 401", w.Code)
		}
	})
}

// --- TestCategories_Create_HTTP -------------------------------------------

func TestCategories_Create_HTTP(t *testing.T) {
	t.Run("valid top-level body returns 201", func(t *testing.T) {
		s, _ := loginAsAdmin(t)

		body := map[string]any{
			"name":  "Test New Category",
			"kind":  "expense",
			"icon":  "tag",
			"color": "#FF00FF",
		}
		var resp models.Category
		w := s.DoJSON(t, http.MethodPost, "/api/categories", body, &resp)
		if w.Code != http.StatusCreated {
			t.Fatalf("status = %d, want 201 (body: %s)", w.Code, w.Body.String())
		}
		if resp.Name != "Test New Category" {
			t.Errorf("name = %q, want 'Test New Category'", resp.Name)
		}
		if resp.ID == "" {
			t.Error("id is empty")
		}
	})

	t.Run("valid child body sets parentId", func(t *testing.T) {
		s, _ := loginAsAdmin(t)
		parentID := s.SeededCategoryID(t, "Habitatge")

		body := map[string]any{
			"name":     "Sub-Habitatge",
			"kind":     "expense",
			"parentId": parentID,
		}
		var resp models.Category
		w := s.DoJSON(t, http.MethodPost, "/api/categories", body, &resp)
		if w.Code != http.StatusCreated {
			t.Fatalf("status = %d, want 201 (body: %s)", w.Code, w.Body.String())
		}
		if resp.ParentID == nil || *resp.ParentID != parentID {
			var gotParent string
			if resp.ParentID != nil {
				gotParent = *resp.ParentID
			}
			t.Errorf("parentId = %q, want %q", gotParent, parentID)
		}
	})

	t.Run("missing required name returns 400", func(t *testing.T) {
		s, _ := loginAsAdmin(t)
		w := s.DoJSON(t, http.MethodPost, "/api/categories",
			map[string]any{"kind": "expense"}, nil)
		if w.Code != http.StatusBadRequest {
			t.Errorf("status = %d, want 400", w.Code)
		}
	})

	t.Run("returns 401 without auth cookie", func(t *testing.T) {
		s := testutil.NewServer(t)
		w := s.DoJSON(t, http.MethodPost, "/api/categories",
			map[string]any{"name": "x", "kind": "expense"}, nil)
		if w.Code != http.StatusUnauthorized {
			t.Errorf("status = %d, want 401", w.Code)
		}
	})
}

// --- TestCategories_Update_HTTP --------------------------------------------

func TestCategories_Update_HTTP(t *testing.T) {
	t.Run("valid update returns 200 with renamed category", func(t *testing.T) {
		s, _ := loginAsAdmin(t)
		id := s.SeededCategoryID(t, "Habitatge")

		body := map[string]any{
			"name": "Habitatge Renamed",
			"kind": "expense",
		}
		var resp models.Category
		w := s.DoJSON(t, http.MethodPut, "/api/categories/"+id, body, &resp)
		if w.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200 (body: %s)", w.Code, w.Body.String())
		}
		if resp.Name != "Habitatge Renamed" {
			t.Errorf("name = %q, want 'Habitatge Renamed'", resp.Name)
		}
	})

	t.Run("unknown id returns 404", func(t *testing.T) {
		s, _ := loginAsAdmin(t)
		var resp models.ErrorResponse
		w := s.DoJSON(t, http.MethodPut, "/api/categories/no-such-id",
			map[string]any{"name": "x", "kind": "expense"}, &resp)
		if w.Code != http.StatusNotFound {
			t.Errorf("status = %d, want 404", w.Code)
		}
		if resp.Error != "category not found" {
			t.Errorf("error = %q, want 'category not found'", resp.Error)
		}
	})

	t.Run("malformed JSON returns 400", func(t *testing.T) {
		s, _ := loginAsAdmin(t)
		req := newJSONRequest(t, http.MethodPut,
			"/api/categories/"+s.SeededCategoryID(t, "Habitatge"),
			"not json", s.Cookie)
		w := s.Do(req)
		if w.Code != http.StatusBadRequest {
			t.Errorf("status = %d, want 400", w.Code)
		}
	})

	t.Run("returns 401 without auth cookie", func(t *testing.T) {
		s := testutil.NewServer(t)
		w := s.DoJSON(t, http.MethodPut, "/api/categories/any",
			map[string]any{"name": "x", "kind": "expense"}, nil)
		if w.Code != http.StatusUnauthorized {
			t.Errorf("status = %d, want 401", w.Code)
		}
	})
}

// --- TestCategories_Archive_HTTP ------------------------------------------

func TestCategories_Archive_HTTP(t *testing.T) {
	t.Run("valid id returns 200 with archived=true", func(t *testing.T) {
		s, _ := loginAsAdmin(t)
		id := s.SeededCategoryID(t, "Habitatge")

		var resp models.Category
		w := s.DoJSON(t, http.MethodPatch, "/api/categories/"+id+"/archive", nil, &resp)
		if w.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200", w.Code)
		}
		// models.BoolInt unmarshals JSON booleans into 0/1.
		if resp.Archived == 0 {
			t.Errorf("archived = %d, want 1 (true)", resp.Archived)
		}
	})

	t.Run("unknown id returns 404", func(t *testing.T) {
		s, _ := loginAsAdmin(t)
		var resp models.ErrorResponse
		w := s.DoJSON(t, http.MethodPatch, "/api/categories/no-such-id/archive", nil, &resp)
		if w.Code != http.StatusNotFound {
			t.Errorf("status = %d, want 404", w.Code)
		}
		if resp.Error != "category not found" {
			t.Errorf("error = %q, want 'category not found'", resp.Error)
		}
	})

	t.Run("returns 401 without auth cookie", func(t *testing.T) {
		s := testutil.NewServer(t)
		w := s.DoJSON(t, http.MethodPatch, "/api/categories/any/archive", nil, nil)
		if w.Code != http.StatusUnauthorized {
			t.Errorf("status = %d, want 401", w.Code)
		}
	})
}

// Note: CategoriesHandler has no Delete method, and routes.go does not
// register DELETE /api/categories/:id. The criterion from the
// improve-api-testing spec is explicitly OUT-OF-SCOPE-BY-DECISION for
// fix-api-production-bugs (see proposal s3). Rationale: categories are
// referenced by transactions.category_id and budgets.category_id (FK
// NO ACTION); a hard delete with referenced data fails. The existing
// Archive (PATCH /api/categories/:id/archive) covers the soft-delete
// use case. The handler has 6 methods (List, Tree, ByID, Create,
// Update, Archive, Reorder) — all covered above and in the Reorder test
// below.

// --- TestCategories_Reorder_HTTP ------------------------------------------

func TestCategories_Reorder_HTTP(t *testing.T) {
	t.Run("valid order returns 200 with ok:true", func(t *testing.T) {
		s, _ := loginAsAdmin(t)
		id1 := s.SeededCategoryID(t, "Habitatge")
		id2 := s.SeededCategoryID(t, "Salut")

		var resp map[string]any
		w := s.DoJSON(t, http.MethodPost, "/api/categories/reorder", map[string]any{
			"order": []string{id2, id1},
		}, &resp)
		if w.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200 (body: %s)", w.Code, w.Body.String())
		}
		if ok, _ := resp["ok"].(bool); !ok {
			t.Errorf("ok = %v, want true", resp["ok"])
		}

		// Verify the new order in a subsequent list call.
		var list []models.Category
		w = s.DoJSON(t, http.MethodGet, "/api/categories", nil, &list)
		if w.Code != http.StatusOK {
			t.Fatalf("list after reorder: %d", w.Code)
		}
		// The reordered categories should now appear with the new sortOrder.
		var id2Order, id1Order = -1, -1
		for _, c := range list {
			if c.ID == id2 {
				id2Order = c.SortOrder
			}
			if c.ID == id1 {
				id1Order = c.SortOrder
			}
		}
		if id2Order == -1 || id1Order == -1 {
			t.Fatalf("reordered categories not found in list (id2Order=%v, id1Order=%v)", id2Order, id1Order)
		}
		if id2Order >= id1Order {
			t.Errorf("id2 should sort before id1; got id2Order=%v, id1Order=%v", id2Order, id1Order)
		}
	})

	t.Run("malformed body returns 400", func(t *testing.T) {
		s, _ := loginAsAdmin(t)
		w := s.DoJSON(t, http.MethodPost, "/api/categories/reorder", map[string]any{}, nil)
		if w.Code != http.StatusBadRequest {
			t.Errorf("status = %d, want 400", w.Code)
		}
	})

	t.Run("returns 401 without auth cookie", func(t *testing.T) {
		s := testutil.NewServer(t)
		w := s.DoJSON(t, http.MethodPost, "/api/categories/reorder",
			map[string]any{"order": []string{}}, nil)
		if w.Code != http.StatusUnauthorized {
			t.Errorf("status = %d, want 401", w.Code)
		}
	})
}
