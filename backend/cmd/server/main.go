// Finances API
//
// Self-hosted personal finance API.
//
//	@title			Finances API
//	@version		1.0
//	@description	Self-hosted personal finance API
//	@host			localhost:3001
//	@BasePath		/api
//	@securityDefinitions.apikey	cookieAuth
//	@in				cookie
//	@name			finances_session
package main

import (
	"log"
	"os"

	"github.com/gin-gonic/gin"

	"github.com/mgurt/finances/internal/api"
	"github.com/mgurt/finances/internal/apitypes"
	"github.com/mgurt/finances/internal/auth"
	"github.com/mgurt/finances/internal/db"

	_ "github.com/mgurt/finances/internal/docs"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "3001"
	}

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "./data/finances.db"
	}

	passwordHash := os.Getenv("APP_PASSWORD_HASH")
	if passwordHash == "" {
		// Dev fallback: bcrypt cost-10 hash of "finances". Generated with
		// golang.org/x/crypto/bcrypt; verified safe to bake in because bcrypt
		// is one-way. Override with APP_PASSWORD_HASH in any non-local env.
		log.Println("WARNING: APP_PASSWORD_HASH not set, using dev default (password: \"finances\")")
		passwordHash = "$2a$10$UOnIpxpZaDHM7ps65RZTj.trYBmU6ybIHtz/SAjfR1vmkuKajSEMS"
	}

	jwtSecret := os.Getenv("APP_JWT_SECRET")
	if jwtSecret == "" {
		log.Println("WARNING: APP_JWT_SECRET not set, using unsafe dev default")
		jwtSecret = "unsafe-dev-secret-change-me"
	}

	// Open DB connection
	database, err := db.Open()
	if err != nil {
		log.Fatalf("failed to open database: %v", err)
	}
	defer database.Close()

	// Run migrations
	if err := db.RunMigrations(database); err != nil {
		log.Fatalf("failed to run migrations: %v", err)
	}

	// Seed default data
	if err := db.Seed(database); err != nil {
		log.Fatalf("failed to seed database: %v", err)
	}

	// Create server and register routes
	server := apitypes.NewServer(database, apitypes.Config{
		Port:         port,
		PasswordHash: passwordHash,
		JWTSecret:    jwtSecret,
		RateLimiter:  auth.NewRateLimiter(),
	})

	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(gin.Recovery())

	api.RegisterRoutes(r, server)

	log.Printf("Starting server on :%s", port)
	if err := r.Run(":" + port); err != nil {
		log.Fatalf("server failed: %v", err)
	}
}