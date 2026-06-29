package models_test

import (
	"testing"

	"github.com/mgurt/finances/internal/models"
)

// Tests for models.BoolInt. The package-local duplicate previously used in
// this file shadowed the production type; this file now exercises the real
// models.BoolInt to prove the JSON round-trip.

func TestBoolInt_MarshalJSON(t *testing.T) {
	tests := []struct {
		name  string
		value models.BoolInt
		want  string
	}{
		{"zero is false", models.BoolInt(0), "false"},
		{"one is true", models.BoolInt(1), "true"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := tt.value.MarshalJSON()
			if err != nil {
				t.Fatalf("MarshalJSON error: %v", err)
			}
			if string(got) != tt.want {
				t.Fatalf("got %s, want %s", string(got), tt.want)
			}
		})
	}
}

func TestBoolInt_UnmarshalJSON(t *testing.T) {
	t.Run("true maps to 1", func(t *testing.T) {
		var got models.BoolInt
		if err := got.UnmarshalJSON([]byte("true")); err != nil {
			t.Fatalf("UnmarshalJSON error: %v", err)
		}
		if got != 1 {
			t.Errorf("got %d, want 1", got)
		}
	})

	t.Run("false maps to 0", func(t *testing.T) {
		var got models.BoolInt
		if err := got.UnmarshalJSON([]byte("false")); err != nil {
			t.Fatalf("UnmarshalJSON error: %v", err)
		}
		if got != 0 {
			t.Errorf("got %d, want 0", got)
		}
	})

	t.Run("0 maps to 0", func(t *testing.T) {
		var got models.BoolInt
		if err := got.UnmarshalJSON([]byte("0")); err != nil {
			t.Fatalf("UnmarshalJSON error: %v", err)
		}
		if got != 0 {
			t.Errorf("got %d, want 0", got)
		}
	})

	t.Run("1 maps to 1", func(t *testing.T) {
		var got models.BoolInt
		if err := got.UnmarshalJSON([]byte("1")); err != nil {
			t.Fatalf("UnmarshalJSON error: %v", err)
		}
		if got != 1 {
			t.Errorf("got %d, want 1", got)
		}
	})

	t.Run("rejects non-bool / non-0|1 tokens", func(t *testing.T) {
		// "yes" is not a recognized BoolInt value and must surface as an
		// error without mutating the receiver.
		var got models.BoolInt
		err := got.UnmarshalJSON([]byte(`"yes"`))
		if err == nil {
			t.Fatalf("expected error for \"yes\", got nil (got = %d)", got)
		}
		if got != 0 {
			t.Errorf("got = %d after rejected unmarshal, want 0 (unchanged)", got)
		}
	})
}
