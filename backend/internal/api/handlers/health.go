package handlers

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/mgurt/finances/internal/apitypes"
	"github.com/mgurt/finances/internal/models"
)

// HealthHandler handles health check endpoint.
type HealthHandler struct {
	Server *apitypes.Server
}

// NewHealthHandler creates a new HealthHandler.
func NewHealthHandler(srv *apitypes.Server) *HealthHandler {
	return &HealthHandler{Server: srv}
}

// Health godoc
// @Summary      Health check
// @Description  Returns server health status with version, uptime and timestamp
// @Tags         health
// @Produce      json
// @Success      200  {object}  models.HealthResponse
// @Router       /health [get]
func (h *HealthHandler) Health(c *gin.Context) {
	uptime := time.Since(h.Server.StartTime).String()
	c.JSON(http.StatusOK, models.HealthResponse{
		Status:    "ok",
		Version:   "1.0.0",
		Uptime:    uptime,
		Timestamp: time.Now().UTC().Format(time.RFC3339),
	})
}