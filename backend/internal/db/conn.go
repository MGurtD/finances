package db

import (
	"database/sql"
	"os"

	_ "modernc.org/sqlite"
)

// Open opens a SQLite database connection with WAL mode and foreign keys enabled.
// DATABASE_URL env var controls the path: defaults to ./data/finances.db
func Open() (*sql.DB, error) {
	path := os.Getenv("DATABASE_URL")
	if path == "" {
		path = "./data/finances.db"
	}

	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, err
	}

	// Enable WAL mode for better concurrent performance.
	// For :memory:, WAL is a no-op and returns "memory" — that's fine.
	if _, err := db.Exec("PRAGMA journal_mode=WAL"); err != nil {
		db.Close()
		return nil, err
	}

	// Enable foreign key constraints
	if _, err := db.Exec("PRAGMA foreign_keys=ON"); err != nil {
		db.Close()
		return nil, err
	}

	return db, nil
}