package api

import (
	"github.com/gin-gonic/gin"
	swaggerFiles "github.com/swaggo/files"
	ginSwagger "github.com/swaggo/gin-swagger"
	"github.com/mgurt/finances/internal/api/handlers"
	"github.com/mgurt/finances/internal/apitypes"
)

// RegisterRoutes registers all API routes on the given Gin engine.
func RegisterRoutes(r *gin.Engine, srv *apitypes.Server) {
	// Global middleware
	r.Use(CORSMiddleware())
	r.Use(RequestLogger())
	r.Use(Recovery())

	// Public health endpoint (no /api prefix)
	healthHandler := handlers.NewHealthHandler(srv)
	r.GET("/health", healthHandler.Health)

	// API group
	apiGroup := r.Group("/api")
	{
		// Auth routes (public - no auth middleware)
		authHandler := handlers.NewAuthHandler(srv)
		apiGroup.POST("/auth/login", authHandler.Login)
		apiGroup.POST("/auth/logout", authHandler.Logout)
		apiGroup.GET("/auth/status", authHandler.AuthStatus)

		// Protected routes - require auth
		protected := apiGroup.Group("")
		protected.Use(AuthMiddleware(srv))
		protected.Use(RequireAuth())
		{
			accountsHandler := handlers.NewAccountsHandler(srv)
			protected.GET("/accounts", accountsHandler.List)
			protected.GET("/accounts/:id", accountsHandler.ByID)
			protected.POST("/accounts", accountsHandler.Create)
			protected.PUT("/accounts/:id", accountsHandler.Update)
			protected.PATCH("/accounts/:id/archive", accountsHandler.Archive)
			protected.DELETE("/accounts/:id", accountsHandler.Delete)
			protected.POST("/accounts/reorder", accountsHandler.Reorder)
			protected.GET("/accounts/balances", accountsHandler.Balances)

			categoriesHandler := handlers.NewCategoriesHandler(srv)
			protected.GET("/categories", categoriesHandler.List)
			protected.GET("/categories/tree", categoriesHandler.Tree)
			protected.GET("/categories/:id", categoriesHandler.ByID)
			protected.POST("/categories", categoriesHandler.Create)
			protected.PUT("/categories/:id", categoriesHandler.Update)
			protected.PATCH("/categories/:id/archive", categoriesHandler.Archive)
			protected.POST("/categories/reorder", categoriesHandler.Reorder)

			transactionsHandler := handlers.NewTransactionsHandler(srv)
			protected.GET("/transactions", transactionsHandler.List)
			protected.GET("/transactions/:id", transactionsHandler.ByID)
			protected.POST("/transactions", transactionsHandler.Create)
			protected.PUT("/transactions/:id", transactionsHandler.Update)
			protected.DELETE("/transactions/:id", transactionsHandler.Delete)
			protected.GET("/transactions/has-any", transactionsHandler.HasAny)
			protected.POST("/transactions/bulk", transactionsHandler.BulkCreate)
			protected.POST("/transactions/bulk-delete", transactionsHandler.BulkDelete)
			protected.GET("/transactions/recent", transactionsHandler.Recent)
			protected.GET("/transactions/summary-by-month", transactionsHandler.SummaryByMonth)
			protected.GET("/transactions/summary-by-category", transactionsHandler.SummaryByCategory)

			budgetsHandler := handlers.NewBudgetsHandler(srv)
			protected.GET("/budgets", budgetsHandler.List)
			protected.POST("/budgets", budgetsHandler.Upsert)
			protected.PUT("/budgets/:id", budgetsHandler.Update)
			protected.DELETE("/budgets/:id", budgetsHandler.Delete)
			protected.GET("/budgets/status", budgetsHandler.Status)

			dashboardHandler := handlers.NewDashboardHandler(srv)
			protected.GET("/dashboard/summary", dashboardHandler.Summary)
		}
	}

	// Swagger UI
	r.GET("/swagger/*any", ginSwagger.WrapHandler(swaggerFiles.Handler))
}

// RegisterAuthRoutes is a convenience function that registers only auth routes.
// Used for testing.
func RegisterAuthRoutes(r *gin.Engine, srv *apitypes.Server) {
	r.Use(AuthMiddleware(srv))
	authHandler := handlers.NewAuthHandler(srv)
	r.POST("/api/auth/login", authHandler.Login)
	r.POST("/api/auth/logout", authHandler.Logout)
	r.GET("/api/auth/status", authHandler.AuthStatus)
}