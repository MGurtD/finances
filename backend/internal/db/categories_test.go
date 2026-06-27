package db

import (
	"testing"
)

func TestCategories_List(t *testing.T) {
	store, cleanup := testDB(t)
	defer cleanup()

	t.Run("returns seeded categories", func(t *testing.T) {
		categories, err := store.Categories.List(false)
		if err != nil {
			t.Fatalf("List failed: %v", err)
		}
		// 4 income + 17 expense parent categories + 1 subcategory = 22 rows.
		if len(categories) != 22 {
			t.Fatalf("len(categories) = %d, want 22", len(categories))
		}
	})

	t.Run("archived excluded by default", func(t *testing.T) {
		// Archive one category
		err := store.Categories.Archive("00000000-0000-0000-0000-000000000201")
		if err != nil {
			t.Fatalf("Archive failed: %v", err)
		}
		categories, err := store.Categories.List(false)
		if err != nil {
			t.Fatalf("List failed: %v", err)
		}
		if len(categories) != 21 {
			t.Errorf("after archive: len = %d, want 21", len(categories))
		}
	})
}

func TestCategories_Tree(t *testing.T) {
	store, cleanup := testDB(t)
	defer cleanup()

	t.Run("returns hierarchical structure", func(t *testing.T) {
		tree, err := store.Categories.Tree("expense")
		if err != nil {
			t.Fatalf("Tree failed: %v", err)
		}
		// 18 expense rows total, one of which is a child of
		// Transferències internes, so 17 root expense categories.
		if len(tree) != 17 {
			t.Errorf("root expense count = %d, want 17", len(tree))
		}
	})

	t.Run("child appears nested under its parent", func(t *testing.T) {
		tree, err := store.Categories.Tree("expense")
		if err != nil {
			t.Fatalf("Tree failed: %v", err)
		}
		var parent *struct {
			ID       string
			Name     string
			Children []string
		}
		// Find the parent in the tree by name.
		for _, node := range tree {
			if node.Name == "Transferències internes" {
				_ = parent
				if len(node.Children) != 1 {
					t.Fatalf("expected 1 child under Transferències internes, got %d", len(node.Children))
				}
				if node.Children[0].Name != "Entre comptes propis" {
					t.Errorf("child name = %q, want 'Entre comptes propis'", node.Children[0].Name)
				}
				return
			}
		}
		t.Fatal("Transferències internes not found in tree")
	})
}

func TestCategories_Create(t *testing.T) {
	store, cleanup := testDB(t)
	defer cleanup()

	t.Run("creates category", func(t *testing.T) {
		cat, err := store.Categories.Create(CreateCategoryReq{Name: "TestCat", Kind: "expense"})
		if err != nil {
			t.Fatalf("Create failed: %v", err)
		}
		if cat.Name != "TestCat" {
			t.Errorf("name = %q, want 'TestCat'", cat.Name)
		}
		if cat.Kind != "expense" {
			t.Errorf("kind = %q, want 'expense'", cat.Kind)
		}
	})
}

func TestCategories_Update(t *testing.T) {
	store, cleanup := testDB(t)
	defer cleanup()
	id := "00000000-0000-0000-0000-000000000201"

	t.Run("updates fields", func(t *testing.T) {
		cat, err := store.Categories.Update(id, UpdateCategoryReq{Name: "Updated"})
		if err != nil {
			t.Fatalf("Update failed: %v", err)
		}
		if cat.Name != "Updated" {
			t.Errorf("name = %q, want 'Updated'", cat.Name)
		}
	})
}

func TestCategories_Archive(t *testing.T) {
	store, cleanup := testDB(t)
	defer cleanup()

	t.Run("archives category", func(t *testing.T) {
		err := store.Categories.Archive("00000000-0000-0000-0000-000000000202")
		if err != nil {
			t.Fatalf("Archive failed: %v", err)
		}
		cat, err := store.Categories.ByID("00000000-0000-0000-0000-000000000202")
		if err != nil {
			t.Fatalf("ByID failed: %v", err)
		}
		if cat.Archived != 1 {
			t.Errorf("archived = %d, want 1", cat.Archived)
		}
	})
}

func TestCategories_Reorder(t *testing.T) {
	store, cleanup := testDB(t)
	defer cleanup()

	ids := []string{
		"00000000-0000-0000-0000-000000000201",
		"00000000-0000-0000-0000-000000000202",
		"00000000-0000-0000-0000-000000000203",
	}

	t.Run("updates sort_order", func(t *testing.T) {
		err := store.Categories.Reorder(ids)
		if err != nil {
			t.Fatalf("Reorder failed: %v", err)
		}
		for i, id := range ids {
			cat, _ := store.Categories.ByID(id)
			if cat.SortOrder != i {
				t.Errorf("category %s sortOrder = %d, want %d", id, cat.SortOrder, i)
			}
		}
	})
}