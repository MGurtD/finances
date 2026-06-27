package auth

import "golang.org/x/crypto/bcrypt"

// VerifyPassword checks if the provided plain text password matches the bcrypt hash.
// Returns nil if the password is correct, or an error if it is not.
func VerifyPassword(hash, plainText string) error {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(plainText))
}