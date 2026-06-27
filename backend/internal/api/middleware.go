package api

import (
	"net/http"
	"os"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/mgurt/finances/internal/apitypes"
	"github.com/mgurt/finances/internal/auth"
)

// CORSMiddleware returns a Gin middleware that handles CORS with credentials.
func CORSMiddleware() gin.HandlerFunc {
	return cors.New(cors.Config{
		AllowOrigins:     []string{getAllowedOrigin()},
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept", "Authorization"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
	})
}

func getAllowedOrigin() string {
	origin := os.Getenv("CORS_ORIGIN")
	if origin == "" {
		return "http://localhost:5173"
	}
	return origin
}

// AuthMiddleware reads the finances_session cookie, verifies the JWT,
// and injects user state into the Gin context.
// If no cookie or invalid token, ctx user is set to unauthenticated (not blocked).
func AuthMiddleware(srv *apitypes.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		cookie, err := c.Cookie(cookieName)
		if err != nil || cookie == "" {
			c.Set("authenticated", false)
			c.Next()
			return
		}

		claims, err := auth.VerifyToken(cookie, srv.JWTSecret)
		if err != nil {
			c.Set("authenticated", false)
			c.Next()
			return
		}

		c.Set("authenticated", true)
		if iat, ok := claims["iat"].(float64); ok {
			c.Set("issuedAt", time.Unix(int64(iat), 0).Format(time.RFC3339))
		}
		c.Next()
	}
}

// RequestLogger logs incoming requests.
func RequestLogger() gin.HandlerFunc {
	return gin.LoggerWithFormatter(func(param gin.LogFormatterParams) string {
		return ""
	})
}

// Recovery returns a middleware that recovers from panics and returns 500.
func Recovery() gin.HandlerFunc {
	return gin.CustomRecovery(func(c *gin.Context, recovered interface{}) {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal server error"})
	})
}

// RequireAuth is a middleware that returns 401 if the user is not authenticated.
// Use this on protected routes.
func RequireAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		authenticated, exists := c.Get("authenticated")
		if !exists || !authenticated.(bool) {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			return
		}
		c.Next()
	}
}

const cookieName = "finances_session"