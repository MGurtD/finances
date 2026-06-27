package apitypes

import (
	"database/sql"
	"time"

	"github.com/mgurt/finances/internal/auth"
	"github.com/mgurt/finances/internal/db"
)

// Config holds server configuration.
type Config struct {
	Port         string
	PasswordHash string
	JWTSecret    string
	RateLimiter  *auth.RateLimiter
}

// Server holds dependencies for API handlers.
type Server struct {
	DB           *sql.DB
	Store        *db.Store
	PasswordHash string
	JWTSecret    string
	RateLimiter  *auth.RateLimiter
	StartTime    time.Time
}

// NewServer creates a new Server instance.
func NewServer(database *sql.DB, cfg Config) *Server {
	srv := &Server{
		DB:           database,
		PasswordHash: cfg.PasswordHash,
		JWTSecret:    cfg.JWTSecret,
		RateLimiter:  cfg.RateLimiter,
		StartTime:    time.Now(),
	}
	srv.Store = db.NewStore(database)
	return srv
}
