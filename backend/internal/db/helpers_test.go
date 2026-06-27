package db

import (
	"os"
	"testing"
)

// testDB creates an in-memory SQLite database with schema and seed data.
// Each test should get a fresh DB via testDB().
func testDB(t *testing.T) (*Store, func()) {
	os.Setenv("DATABASE_URL", ":memory:")
	defer os.Unsetenv("DATABASE_URL")

	db, err := Open()
	if err != nil {
		t.Fatalf("Open failed: %v", err)
	}

	if err := RunMigrations(db); err != nil {
		db.Close()
		t.Fatalf("RunMigrations failed: %v", err)
	}

	if err := Seed(db); err != nil {
		db.Close()
		t.Fatalf("Seed failed: %v", err)
	}

	store := NewStore(db)
	cleanup := func() {
		db.Close()
	}
	return store, cleanup
}