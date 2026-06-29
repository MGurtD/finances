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

		var resp []map[string]any
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

		var resp []map[string]any
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

		var resp []map[string]any
		w = s.DoJSON(t, http.MethodGet, "/api/categories", nil, &resp)
		if w.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200", w.Code)
		}
		// Verify Habitatge is not in the response.
		for _, c := range resp {
			if name, _ := c["name"].(string); name == "Habitatge" {
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

		var resp []map[string]any
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
			name, _ := node["name"].(string)
			children, _ := node["children"].([]any)
			if name == "Transferències internes" && len(children) > 0 {
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

		var resp []map[string]any
		w := s.DoJSON(t, http.MethodGet, "/api/categories/tree?kind=expense", nil, &resp)
		if w.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200", w.Code)
		}
		for _, node := range resp {
			kind, _ := node["kind"].(string)
			if kind != "expense" {
				t.Errorf("node.kind = %q, want expense (filter leaked)", kind)
			}
		}
	})

	t.Run("?kind=income returns only income categories", func(t *testing.T) {
		s, _ := loginAsAdmin(t)

		var resp []map[string]any
		w := s.DoJSON(t, http.MethodGet, "/api/categories/tree?kind=income", nil, &resp)
		if w.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200", w.Code)
		}
		if len(resp) == 0 {
			t.Fatal("expected at least 1 income category in seed")
		}
		for _, node := range resp {
			kind, _ := node["kind"].(string)
			if kind != "income" {
				t.Errorf("node.kind = %q, want income", kind)
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

		var resp map[string]any
		w := s.DoJSON(t, http.MethodGet, "/api/categories/"+id, nil, &resp)
		if w.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200", w.Code)
		}
		if got, _ := resp["id"].(string); got != id {
			t.Errorf("id = %q, want %q", got, id)
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
			"name": "Test New Category",
			"kind": "expense",
			"icon": "tag",
			"color": "#FF00FF",
		}
		var resp map[string]any
		w := s.DoJSON(t, http.MethodPost, "/api/categories", body, &resp)
		if w.Code != http.StatusCreated {
			t.Fatalf("status = %d, want 201 (body: %s)", w.Code, w.Body.String())
		}
		if name, _ := resp["name"].(string); name != "Test New Category" {
			t.Errorf("name = %q, want 'Test New Category'", name)
		}
		if id, _ := resp["id"].(string); id == "" {
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
		var resp map[string]any
		w := s.DoJSON(t, http.MethodPost, "/api/categories", body, &resp)
		if w.Code != http.StatusCreated {
			t.Fatalf("status = %d, want 201 (body: %s)", w.Code, w.Body.String())
		}
		gotParent, _ := resp["parentId"].(string)
		if gotParent != parentID {
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
		var resp map[string]any
		w := s.DoJSON(t, http.MethodPut, "/api/categories/"+id, body, &resp)
		if w.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200 (body: %s)", w.Code, w.Body.String())
		}
		if name, _ := resp["name"].(string); name != "Habitatge Renamed" {
			t.Errorf("name = %q, want 'Habitatge Renamed'", name)
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

		var resp map[string]any
		w := s.DoJSON(t, http.MethodPatch, "/api/categories/"+id+"/archive", nil, &resp)
		if w.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200", w.Code)
		}
		if archived, ok := resp["archived"].(bool); !ok || !archived {
			t.Errorf("archived = %v, want true", resp["archived"])
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
// register DELETE /api/categories/:id. The SDD spec listed a
// TestCategories_Delete_HTTP scenario, but adding it would require
// production changes (new handler method + new route), which is out of
// scope per the no-production-changes rule for this change. The actual
// handler has 6 methods (List, Tree, ByID, Create, Update, Archive,
// Reorder) — all covered above and in the Reorder test below.

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
		var list []map[string]any
		w = s.DoJSON(t, http.MethodGet, "/api/categories", nil, &list)
		if w.Code != http.StatusOK {
			t.Fatalf("list after reorder: %d", w.Code)
		}
		// The reordered categories should now appear with the new sortOrder.
		var id2Order, id1Order float64 = -1, -1
		for _, c := range list {
			id, _ := c["id"].(string)
			order, _ := c["sortOrder"].(float64)
			if id == id2 {
				id2Order = order
			}
			if id == id1 {
				id1Order = order
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
			t.Errorf("status = %d, want 400 (body: %s)", w.Code, w.Body.String())
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
