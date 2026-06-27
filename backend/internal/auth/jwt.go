package auth

import (
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// SignToken creates a new JWT token with iat and exp claims using HS256.
// The exp claim is set to 7 days from issuedAt.
func SignToken(secret string, issuedAt time.Time) (string, error) {
	claims := jwt.MapClaims{
		"iat": float64(issuedAt.Unix()),
		"exp": float64(issuedAt.Add(7 * 24 * time.Hour).Unix()),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(secret))
}

// VerifyToken parses and validates a JWT token.
// Returns the claims map if valid, or an error if invalid/expired.
func VerifyToken(tokenString string, secret string) (jwt.MapClaims, error) {
	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		// Validate the signing method
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, ErrInvalidSigningMethod
		}
		return []byte(secret), nil
	})

	if err != nil {
		return nil, err
	}

	if !token.Valid {
		return nil, ErrInvalidToken
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return nil, ErrInvalidClaims
	}

	return claims, nil
}

// Error types for JWT operations.
var (
	ErrInvalidSigningMethod = &AuthError{Code: "invalid_signing_method"}
	ErrInvalidToken         = &AuthError{Code: "invalid_token"}
	ErrInvalidClaims        = &AuthError{Code: "invalid_claims"}
)

// AuthError represents an authentication error with a code.
type AuthError struct {
	Code string
}

func (e *AuthError) Error() string {
	return e.Code
}