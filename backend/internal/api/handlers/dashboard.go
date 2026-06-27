package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/mgurt/finances/internal/apitypes"
	"github.com/mgurt/finances/internal/models"
)

// DashboardHandler handles dashboard endpoints.
type DashboardHandler struct {
	Server *apitypes.Server
}

// NewDashboardHandler creates a new DashboardHandler.
func NewDashboardHandler(srv *apitypes.Server) *DashboardHandler {
	return &DashboardHandler{Server: srv}
}

// Summary godoc
// @Summary      Get dashboard summary
// @Description  Returns income, expense, net, count, and by-category breakdown for a date range
// @Tags         dashboard
// @Produce      json
// @Param        from   query  string  true  "start date (YYYY-MM-DD)"
// @Param        to     query  string  true  "end date (YYYY-MM-DD)"
// @Param        accountId  query  string  false  "filter by account ID"
// @Success      200  {object}  models.DashboardSummary
// @Failure      400  {object}  models.ErrorResponse
// @Failure      401  {object}  models.ErrorResponse
// @Router       /api/dashboard/summary [get]
// @Security     cookieAuth
func (h *DashboardHandler) Summary(c *gin.Context) {
	from := c.Query("from")
	to := c.Query("to")
	if from == "" || to == "" {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "from and to are required"})
		return
	}

	// Note: accountId filtering not yet implemented in db layer
	summary, err := h.Server.Store.Dashboard.Summary(from, to)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "failed to get dashboard summary"})
		return
	}
	c.JSON(http.StatusOK, summary)
}