package db

import (
	"database/sql"
	"embed"
	"io/fs"
	"sort"
	"strings"
)

//go:embed migrations/*.sql
var migrationFS embed.FS

// RunMigrations applies all SQL migration files in ascending order.
// Uses CREATE TABLE IF NOT EXISTS for idempotency.
func RunMigrations(db *sql.DB) error {
	entries, err := fs.ReadDir(migrationFS, "migrations")
	if err != nil {
		return err
	}

	// Collect and sort .sql files
	var files []string
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".sql") {
			continue
		}
		files = append(files, entry.Name())
	}
	sort.Strings(files)

	// Execute each migration file
	for _, filename := range files {
		content, err := fs.ReadFile(migrationFS, "migrations/"+filename)
		if err != nil {
			return err
		}

		// Split by semicolon and execute each statement
		statements := strings.Split(string(content), ";")
		for _, stmt := range statements {
			stmt = strings.TrimSpace(stmt)
			if stmt == "" {
				continue
			}
			if _, err := db.Exec(stmt); err != nil {
				return err
			}
		}
	}

	return nil
}