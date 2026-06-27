package auth

import (
	"fmt"
	"os"

	"github.com/gin-gonic/gin"
)

const cookieName = "finances_session"

// SetSessionCookie sets the session cookie on the response.
// Flags: httpOnly, sameSite=strict, secure based on NODE_ENV, path=/, maxAge=7d.
func SetSessionCookie(c *gin.Context, token string) {
	secure := os.Getenv("NODE_ENV") == "production"
	// Use direct header construction to ensure SameSite=strict is included
	// since http.Cookie.String() does not output SameSite
	cookie := fmt.Sprintf("%s=%s; Path=/; Max-Age=604800; HttpOnly; SameSite=Strict",
		cookieName, token)
	if secure {
		cookie += "; Secure"
	}
	c.Header("Set-Cookie", cookie)
}

// ClearSessionCookie clears the session cookie by setting it to expire immediately.
func ClearSessionCookie(c *gin.Context) {
	secure := os.Getenv("NODE_ENV") == "production"
	cookie := fmt.Sprintf("%s=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict", cookieName)
	if secure {
		cookie += "; Secure"
	}
	c.Header("Set-Cookie", cookie)
}