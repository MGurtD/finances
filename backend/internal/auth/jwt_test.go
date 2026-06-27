package auth_test

import (
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/mgurt/finances/internal/auth"
)

func TestSignToken_Roundtrip(t *testing.T) {
	secret := "test-secret-key-123"
	now := time.Now()

	// RED: SignToken should produce a valid JWT with iat claim
	token, err := auth.SignToken(secret, now)
	if err != nil {
		t.Fatalf("SignToken failed: %v", err)
	}
	if token == "" {
		t.Fatal("SignToken returned empty string")
	}

	// GREEN: VerifyToken should parse and validate the token
	claims, err := auth.VerifyToken(token, secret)
	if err != nil {
		t.Fatalf("VerifyToken failed: %v", err)
	}

	// Verify iat claim is set
	iat, ok := claims["iat"].(float64)
	if !ok {
		t.Fatal("iat claim not found or not float64")
	}
	if iat == 0 {
		t.Fatal("iat claim is zero")
	}

	// Verify exp claim is set (7 days from now)
	exp, ok := claims["exp"].(float64)
	if !ok {
		t.Fatal("exp claim not found or not float64")
	}
	expectedExp := now.Add(7 * 24 * time.Hour).Unix()
	// Allow 5 second tolerance for execution time
	if exp < float64(expectedExp-5) || exp > float64(expectedExp+5) {
		t.Fatalf("exp = %v, want ~%v", exp, expectedExp)
	}
}

func TestVerifyToken_Expired(t *testing.T) {
	secret := "test-secret-key-123"
	now := time.Now().Add(-8 * 24 * time.Hour) // 8 days ago (expired)

	// Create an expired token manually
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"iat": float64(now.Unix()),
		"exp": float64(now.Add(7 * 24 * time.Hour).Unix()), // expired 1 day ago
	})
	tokenString, err := token.SignedString([]byte(secret))
	if err != nil {
		t.Fatalf("failed to create expired token: %v", err)
	}

	// RED: VerifyToken should reject expired token
	_, err = auth.VerifyToken(tokenString, secret)
	if err == nil {
		t.Fatal("VerifyToken should have rejected expired token, but it succeeded")
	}
}

func TestVerifyToken_WrongSecret(t *testing.T) {
	secret := "correct-secret"
	wrongSecret := "wrong-secret"
	now := time.Now()

	token, err := auth.SignToken(secret, now)
	if err != nil {
		t.Fatalf("SignToken failed: %v", err)
	}

	// RED: VerifyToken should reject token signed with different secret
	_, err = auth.VerifyToken(token, wrongSecret)
	if err == nil {
		t.Fatal("VerifyToken should have rejected wrong-secret token, but it succeeded")
	}
}

func TestVerifyToken_MalformedToken(t *testing.T) {
	secret := "test-secret"

	// RED: VerifyToken should reject malformed token
	_, err := auth.VerifyToken("not.a.valid.jwt.token", secret)
	if err == nil {
		t.Fatal("VerifyToken should have rejected malformed token, but it succeeded")
	}
}