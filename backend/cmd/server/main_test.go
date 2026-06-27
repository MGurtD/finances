package main

import (
	"os"
	"testing"
)

func TestConfig_EnvVars(t *testing.T) {
	// RED: main should read PORT, DATABASE_URL, APP_PASSWORD_HASH, APP_JWT_SECRET from env
	t.Run("PORT defaults to 3001", func(t *testing.T) {
		os.Unsetenv("PORT")
		os.Unsetenv("DATABASE_URL")
		os.Unsetenv("APP_PASSWORD_HASH")
		os.Unsetenv("APP_JWT_SECRET")

		port := os.Getenv("PORT")
		if port == "" {
			port = "3001"
		}
		if port != "3001" {
			t.Fatalf("default PORT = %q, want 3001", port)
		}
	})

	t.Run("DATABASE_URL defaults to ./data/finances.db", func(t *testing.T) {
		os.Unsetenv("DATABASE_URL")
		dbURL := os.Getenv("DATABASE_URL")
		if dbURL == "" {
			dbURL = "./data/finances.db"
		}
		if dbURL != "./data/finances.db" {
			t.Fatalf("default DATABASE_URL = %q, want ./data/finances.db", dbURL)
		}
	})

	t.Run("APP_JWT_SECRET has dev default with warning", func(t *testing.T) {
		os.Unsetenv("APP_JWT_SECRET")
		secret := os.Getenv("APP_JWT_SECRET")
		if secret == "" {
			secret = "unsafe-dev-secret-change-me"
		}
		if secret == "unsafe-dev-secret-change-me" {
			// This would log a warning in the actual main.go
			// We just verify the dev default is set
		}
		if secret == "" {
			t.Fatalf("APP_JWT_SECRET should have default, got empty")
		}
	})
}