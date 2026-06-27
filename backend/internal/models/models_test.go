package models_test

import (
	"encoding/json"
	"testing"
)

// BoolInt is a custom type for SQLite integer (0/1) to Go bool marshaling.
// archived=0 → JSON "archived": false
// archived=1 → JSON "archived": true

type BoolInt int

func (b BoolInt) MarshalJSON() ([]byte, error) {
	return json.Marshal(b != 0)
}

func TestBoolInt_MarshalJSON(t *testing.T) {
	tests := []struct {
		name  string
		value BoolInt
		want  string
	}{
		{"zero is false", BoolInt(0), "false"},
		{"one is true", BoolInt(1), "true"},
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