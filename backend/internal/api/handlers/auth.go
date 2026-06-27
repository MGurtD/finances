package handlers

import (
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/mgurt/finances/internal/apitypes"
	"github.com/mgurt/finances/internal/auth"
	"github.com/mgurt/finances/internal/models"
)

// AuthHandler handles authentication endpoints.
type AuthHandler struct {
	Server *apitypes.Server
}

// NewAuthHandler creates a new AuthHandler.
func NewAuthHandler(srv *apitypes.Server) *AuthHandler {
	return &AuthHandler{Server: srv}
}

// Login godoc
// @Summary      Login
// @Description  Authenticate with password and receive a JWT session cookie
// @Tags         auth
// @Accept       json
// @Produce      json
// @Param        body  body  models.LoginReq  true  "Password credentials"
// @Success      200   {object}  models.AuthStatusResponse
// @Failure      400   {object}  models.ErrorResponse
// @Failure      401   {object}  models.ErrorResponse
// @Failure      429   {object}  models.ErrorResponse
// @Router       /api/auth/login [post]
// @Security     cookieAuth
func (h *AuthHandler) Login(c *gin.Context) {
	var req models.LoginReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "invalid request"})
		return
	}

	// Rate limiting
	if h.Server.RateLimiter != nil {
		allowed, retryAfterMs := h.Server.RateLimiter.Allow(c.ClientIP())
		if !allowed {
			c.JSON(http.StatusTooManyRequests, models.ErrorResponse{
				Error: fmt.Sprintf("too many attempts, retry after %ds", retryAfterMs/1000),
			})
			return
		}
	}

	// Verify password
	if err := auth.VerifyPassword(h.Server.PasswordHash, req.Password); err != nil {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse{Error: "invalid password"})
		return
	}

	// Reset rate limit on success
	if h.Server.RateLimiter != nil {
		h.Server.RateLimiter.Reset(c.ClientIP())
	}

	// Issue JWT
	issuedAt := time.Now()
	token, err := auth.SignToken(h.Server.JWTSecret, issuedAt)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "failed to issue token"})
		return
	}

	// Set session cookie
	auth.SetSessionCookie(c, token)

	c.JSON(http.StatusOK, models.AuthStatusResponse{Authenticated: true})
}

// Logout godoc
// @Summary      Logout
// @Description  Clear the session cookie
// @Tags         auth
// @Produce      json
// @Success      200  {object}  models.AuthStatusResponse
// @Router       /api/auth/logout [post]
// @Security     cookieAuth
func (h *AuthHandler) Logout(c *gin.Context) {
	auth.ClearSessionCookie(c)
	c.JSON(http.StatusOK, models.AuthStatusResponse{Authenticated: false})
}

// AuthStatus godoc
// @Summary      Auth status
// @Description  Check whether the current request is authenticated
// @Tags         auth
// @Produce      json
// @Success      200  {object}  models.AuthStatusResponse
// @Failure      401  {object}  models.ErrorResponse
// @Router       /api/auth/status [get]
func (h *AuthHandler) AuthStatus(c *gin.Context) {
	authenticated, exists := c.Get("authenticated")
	if !exists || !authenticated.(bool) {
		c.JSON(http.StatusOK, models.AuthStatusResponse{Authenticated: false})
		return
	}

	resp := models.AuthStatusResponse{Authenticated: true}
	if issuedAt, ok := c.Get("issuedAt"); ok {
		s := issuedAt.(string)
		resp.IssuedAt = &s
	}
	c.JSON(http.StatusOK, resp)
}