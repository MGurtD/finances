package auth

import (
	"sync"
	"time"
)

const (
	windowMs    = 60_000
	maxAttempts = 5
)

type bucket struct {
	count    int
	resetAt  int64
}

// RateLimiter is a fixed-window rate limiter.
// It allows up to maxAttempts per window per key.
type RateLimiter struct {
	mu    sync.Mutex
	bucks map[string]*bucket
}

// NewRateLimiter creates a new RateLimiter.
func NewRateLimiter() *RateLimiter {
	rl := &RateLimiter{
		bucks: make(map[string]*bucket),
	}
	// Background cleaner every 5 minutes
	go rl.cleanup()
	return rl
}

// Allow checks if a request from the given key is allowed.
// Returns (allowed, retryAfterMs).
// If allowed=false, retryAfterMs indicates when the caller can retry.
func (rl *RateLimiter) Allow(key string) (bool, int) {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now().UnixMilli()

	b, ok := rl.bucks[key]
	if !ok || b.resetAt <= now {
		// New or expired window
		rl.bucks[key] = &bucket{count: 1, resetAt: now + windowMs}
		return true, 0
	}

	if b.count >= maxAttempts {
		return false, int(b.resetAt - now)
	}

	b.count++
	return true, 0
}

// Reset clears the rate limit bucket for the given key.
// Called on successful login to reset the counter.
func (rl *RateLimiter) Reset(key string) {
	rl.mu.Lock()
	defer rl.mu.Unlock()
	delete(rl.bucks, key)
}

// cleanup removes expired buckets every 5 minutes.
func (rl *RateLimiter) cleanup() {
	ticker := time.NewTicker(5 * time.Minute)
	for range ticker.C {
		rl.mu.Lock()
		now := time.Now().UnixMilli()
		for k, b := range rl.bucks {
			if b.resetAt <= now {
				delete(rl.bucks, k)
			}
		}
		rl.mu.Unlock()
	}
}