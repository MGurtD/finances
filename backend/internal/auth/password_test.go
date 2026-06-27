package auth_test

import (
	"testing"

	"github.com/mgurt/finances/internal/auth"
	"golang.org/x/crypto/bcrypt"
)

func TestVerifyPassword_Correct(t *testing.T) {
	// Create a bcrypt hash for "correct-password"
	hash, err := bcrypt.GenerateFromPassword([]byte("correct-password"), bcrypt.DefaultCost)
	if err != nil {
		t.Fatalf("bcrypt.GenerateFromPassword failed: %v", err)
	}

	// RED: VerifyPassword should return nil for correct password
	err = auth.VerifyPassword(string(hash), "correct-password")
	if err != nil {
		t.Fatalf("VerifyPassword(correct) = %v, want nil", err)
	}
}

func TestVerifyPassword_Incorrect(t *testing.T) {
	// Create a bcrypt hash for "correct-password"
	hash, err := bcrypt.GenerateFromPassword([]byte("correct-password"), bcrypt.DefaultCost)
	if err != nil {
		t.Fatalf("bcrypt.GenerateFromPassword failed: %v", err)
	}

	// RED: VerifyPassword should return error for incorrect password
	err = auth.VerifyPassword(string(hash), "wrong-password")
	if err == nil {
		t.Fatal("VerifyPassword(wrong) = nil, want non-nil error")
	}
}