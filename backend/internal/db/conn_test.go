package db

import (
	"os"
	"testing"
)

func TestOpen_SetPragmas(t *testing.T) {
	// GREEN: implement Open() to set WAL + foreign_keys ON
	t.Run("in-memory connection succeeds", func(t *testing.T) {
		os.Setenv("DATABASE_URL", ":memory:")
		defer os.Unsetenv("DATABASE_URL")

		db, err := Open()
		if err != nil {
			t.Fatalf("Open failed: %v", err)
		}
		defer db.Close()

		// Verify connection is alive
		if err := db.Ping(); err != nil {
			t.Fatalf("db.Ping failed: %v", err)
		}

		// Verify WAL mode (or "memory" for :memory: databases where WAL is a no-op)
		var walMode string
		row := db.QueryRow("PRAGMA journal_mode")
		if err := row.Scan(&walMode); err != nil {
			t.Fatalf("PRAGMA journal_mode failed: %v", err)
		}
		if walMode != "wal" && walMode != "memory" {
			t.Fatalf("journal_mode = %q, want wal or memory", walMode)
		}

		// Verify foreign_keys ON
		var fkMode int
		row = db.QueryRow("PRAGMA foreign_keys")
		if err := row.Scan(&fkMode); err != nil {
			t.Fatalf("PRAGMA foreign_keys failed: %v", err)
		}
		if fkMode != 1 {
			t.Fatalf("foreign_keys = %d, want 1", fkMode)
		}
	})
}