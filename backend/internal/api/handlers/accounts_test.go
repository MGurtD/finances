package handlers_test

import (
	"net/http"
	"testing"

	"github.com/mgurt/finances/internal/api/testutil"
	"github.com/mgurt/finances/internal/models"
)

// loginAsAdmin is a small helper that builds a logged-in test server and
// returns the cookie. The returned server has Server.Cookie set, so
// subsequent DoJSON calls authenticate automatically.
func loginAsAdmin(t *testing.T) (*testutil.Server, string) {
	t.Helper()
	s := testutil.NewServer(t)
	cookie := s.Login(t)
	s.Cookie = cookie
	return s, cookie
}

// --- TestAccounts_List_HTTP -----------------------------------------------

func TestAccounts_List_HTTP(t *testing.T) {
	t.Run("empty (unseeded) returns 200 with empty array", func(t *testing.T) {
		s := testutil.NewServer(t, testutil.WithSeeded(false))
		s.Cookie = s.Login(t)

		var resp []models.Account
		w := s.DoJSON(t, http.MethodGet, "/api/accounts", nil, &resp)
		if w.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200", w.Code)
		}
		if len(resp) != 0 {
			t.Errorf("len = %d, want 0 (unseeded)", len(resp))
		}
	})

	t.Run("one seeded account returns 200 with 1 element", func(t *testing.T) {
		s, cookie := loginAsAdmin(t)
		_ = cookie

		var resp []models.Account
		w := s.DoJSON(t, http.MethodGet, "/api/accounts", nil, &resp)
		if w.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200", w.Code)
		}
		if len(resp) != 1 {
			t.Errorf("len = %d, want 1", len(resp))
		}
		if resp[0].Name != "Compte corrent" {
			t.Errorf("name = %q, want 'Compte corrent'", resp[0].Name)
		}
	})

	t.Run("archived excluded by default", func(t *testing.T) {
		s, _ := loginAsAdmin(t)
		// Archive the seeded account.
		w := s.DoJSON(t, http.MethodPatch, "/api/accounts/"+s.SeededAccountID(t)+"/archive", nil, nil)
		if w.Code != http.StatusOK {
			t.Fatalf("archive: %d", w.Code)
		}

		var resp []models.Account
		w = s.DoJSON(t, http.MethodGet, "/api/accounts", nil, &resp)
		if w.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200", w.Code)
		}
		if len(resp) != 0 {
			t.Errorf("len = %d, want 0 (archived excluded)", len(resp))
		}
	})

	t.Run("includeArchived=true returns archived", func(t *testing.T) {
		s, _ := loginAsAdmin(t)
		w := s.DoJSON(t, http.MethodPatch, "/api/accounts/"+s.SeededAccountID(t)+"/archive", nil, nil)
		if w.Code != http.StatusOK {
			t.Fatalf("archive: %d", w.Code)
		}

		var resp []models.Account
		w = s.DoJSON(t, http.MethodGet, "/api/accounts?includeArchived=true", nil, &resp)
		if w.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200", w.Code)
		}
		if len(resp) != 1 {
			t.Errorf("len = %d, want 1 (archived included)", len(resp))
		}
	})

	t.Run("returns 401 without auth cookie", func(t *testing.T) {
		s := testutil.NewServer(t)
		// no cookie
		w := s.DoJSON(t, http.MethodGet, "/api/accounts", nil, nil)
		if w.Code != http.StatusUnauthorized {
			t.Errorf("status = %d, want 401", w.Code)
		}
	})
}

// --- TestAccounts_ByID_HTTP -----------------------------------------------

func TestAccounts_ByID_HTTP(t *testing.T) {
	t.Run("valid id returns 200", func(t *testing.T) {
		s, _ := loginAsAdmin(t)
		id := s.SeededAccountID(t)

		var resp models.Account
		w := s.DoJSON(t, http.MethodGet, "/api/accounts/"+id, nil, &resp)
		if w.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200", w.Code)
		}
		if resp.ID != id {
			t.Errorf("id = %q, want %q", resp.ID, id)
		}
	})

	t.Run("unknown id returns 404 {error:account not found}", func(t *testing.T) {
		s, _ := loginAsAdmin(t)
		var resp models.ErrorResponse
		w := s.DoJSON(t, http.MethodGet, "/api/accounts/no-such-id", nil, &resp)
		if w.Code != http.StatusNotFound {
			t.Errorf("status = %d, want 404", w.Code)
		}
		if resp.Error != "account not found" {
			t.Errorf("error = %q, want 'account not found'", resp.Error)
		}
	})

	t.Run("returns 401 without auth cookie", func(t *testing.T) {
		s := testutil.NewServer(t)
		w := s.DoJSON(t, http.MethodGet, "/api/accounts/any", nil, nil)
		if w.Code != http.StatusUnauthorized {
			t.Errorf("status = %d, want 401", w.Code)
		}
	})
}

// --- TestAccounts_Create_HTTP ---------------------------------------------

func TestAccounts_Create_HTTP(t *testing.T) {
	t.Run("valid body returns 201 with created account", func(t *testing.T) {
		s, _ := loginAsAdmin(t)

		body := map[string]any{
			"name":           "Test Savings",
			"type":           "savings",
			"color":          "#FF0000",
			"icon":           "piggy-bank",
			"initialBalance": 5000,
			"currency":       "EUR",
		}
		var resp models.Account
		w := s.DoJSON(t, http.MethodPost, "/api/accounts", body, &resp)
		if w.Code != http.StatusCreated {
			t.Fatalf("status = %d, want 201 (body: %s)", w.Code, w.Body.String())
		}
		if resp.Name != "Test Savings" {
			t.Errorf("name = %q, want 'Test Savings'", resp.Name)
		}
		if resp.ID == "" {
			t.Error("id is empty")
		}
	})

	t.Run("malformed JSON returns 400", func(t *testing.T) {
		s, _ := loginAsAdmin(t)
		req := s.DoJSON(t, http.MethodPost, "/api/accounts", map[string]any{"name": ""}, nil)
		// name is required by binding, so empty body returns 400.
		if req.Code != http.StatusBadRequest {
			t.Errorf("status = %d, want 400", req.Code)
		}
	})

	t.Run("returns 401 without auth cookie", func(t *testing.T) {
		s := testutil.NewServer(t)
		w := s.DoJSON(t, http.MethodPost, "/api/accounts", map[string]any{
			"name": "x", "type": "checking",
		}, nil)
		if w.Code != http.StatusUnauthorized {
			t.Errorf("status = %d, want 401", w.Code)
		}
	})
}

// --- TestAccounts_Update_HTTP ---------------------------------------------

func TestAccounts_Update_HTTP(t *testing.T) {
	t.Run("valid update returns 200 with renamed account", func(t *testing.T) {
		s, _ := loginAsAdmin(t)
		id := s.SeededAccountID(t)

		body := map[string]any{
			"name":  "Renamed",
			"type":  "checking",
			"color": "#ABCDEF",
			"icon":  "wallet",
		}
		var resp models.Account
		w := s.DoJSON(t, http.MethodPut, "/api/accounts/"+id, body, &resp)
		if w.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200 (body: %s)", w.Code, w.Body.String())
		}
		if resp.Name != "Renamed" {
			t.Errorf("name = %q, want 'Renamed'", resp.Name)
		}
	})

	t.Run("unknown id returns 404", func(t *testing.T) {
		s, _ := loginAsAdmin(t)
		var resp models.ErrorResponse
		w := s.DoJSON(t, http.MethodPut, "/api/accounts/no-such-id",
			map[string]any{"name": "x", "type": "checking"}, &resp)
		if w.Code != http.StatusNotFound {
			t.Errorf("status = %d, want 404", w.Code)
		}
		if resp.Error != "account not found" {
			t.Errorf("error = %q, want 'account not found'", resp.Error)
		}
	})

	t.Run("malformed JSON returns 400", func(t *testing.T) {
		s, _ := loginAsAdmin(t)
		// Build a raw non-JSON body and use Do directly — DoJSON would
		// t.Fatalf on marshal failure.
		req := newJSONRequest(t, http.MethodPut, "/api/accounts/"+s.SeededAccountID(t), "not json", s.Cookie)
		w := s.Do(req)
		if w.Code != http.StatusBadRequest {
			t.Errorf("status = %d, want 400 (body: %s)", w.Code, w.Body.String())
		}
	})

	t.Run("returns 401 without auth cookie", func(t *testing.T) {
		s := testutil.NewServer(t)
		w := s.DoJSON(t, http.MethodPut, "/api/accounts/any",
			map[string]any{"name": "x"}, nil)
		if w.Code != http.StatusUnauthorized {
			t.Errorf("status = %d, want 401", w.Code)
		}
	})
}

// --- TestAccounts_Archive_HTTP --------------------------------------------

func TestAccounts_Archive_HTTP(t *testing.T) {
	t.Run("valid id returns 200 with archived=true", func(t *testing.T) {
		s, _ := loginAsAdmin(t)
		id := s.SeededAccountID(t)

		var resp models.Account
		w := s.DoJSON(t, http.MethodPatch, "/api/accounts/"+id+"/archive", nil, &resp)
		if w.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200", w.Code)
		}
		// models.BoolInt unmarshals JSON booleans into 0/1.
		if resp.Archived == 0 {
			t.Errorf("archived = %d, want 1 (true)", resp.Archived)
		}
	})

	t.Run("unknown id returns 404", func(t *testing.T) {
		s, _ := loginAsAdmin(t)
		var resp models.ErrorResponse
		w := s.DoJSON(t, http.MethodPatch, "/api/accounts/no-such-id/archive", nil, &resp)
		if w.Code != http.StatusNotFound {
			t.Errorf("status = %d, want 404", w.Code)
		}
		if resp.Error != "account not found" {
			t.Errorf("error = %q, want 'account not found'", resp.Error)
		}
	})

	t.Run("returns 401 without auth cookie", func(t *testing.T) {
		s := testutil.NewServer(t)
		w := s.DoJSON(t, http.MethodPatch, "/api/accounts/any/archive", nil, nil)
		if w.Code != http.StatusUnauthorized {
			t.Errorf("status = %d, want 401", w.Code)
		}
	})
}

// --- TestAccounts_Delete_HTTP ---------------------------------------------

func TestAccounts_Delete_HTTP(t *testing.T) {
	t.Run("valid id returns 200 with deleted count", func(t *testing.T) {
		s, _ := loginAsAdmin(t)
		id := s.SeededAccountID(t)

		var resp map[string]any
		w := s.DoJSON(t, http.MethodDelete, "/api/accounts/"+id, nil, &resp)
		if w.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200", w.Code)
		}
		// deleted field is a JSON number; map decode preserves float64.
		if d, ok := resp["deleted"].(float64); !ok || int(d) < 0 {
			t.Errorf("deleted = %v, want non-negative int", resp["deleted"])
		}
	})

	t.Run("unknown id returns 404", func(t *testing.T) {
		s, _ := loginAsAdmin(t)
		var resp models.ErrorResponse
		w := s.DoJSON(t, http.MethodDelete, "/api/accounts/no-such-id", nil, &resp)
		if w.Code != http.StatusNotFound {
			t.Errorf("status = %d, want 404", w.Code)
		}
		if resp.Error != "account not found" {
			t.Errorf("error = %q, want 'account not found'", resp.Error)
		}
	})

	t.Run("returns 401 without auth cookie", func(t *testing.T) {
		s := testutil.NewServer(t)
		w := s.DoJSON(t, http.MethodDelete, "/api/accounts/any", nil, nil)
		if w.Code != http.StatusUnauthorized {
			t.Errorf("status = %d, want 401", w.Code)
		}
	})
}

// --- TestAccounts_Reorder_HTTP --------------------------------------------

func TestAccounts_Reorder_HTTP(t *testing.T) {
	t.Run("valid order returns 200 with ok:true", func(t *testing.T) {
		s, _ := loginAsAdmin(t)
		id := s.SeededAccountID(t)
		// Create a second account so we have a meaningful order.
		var created models.Account
		w := s.DoJSON(t, http.MethodPost, "/api/accounts", map[string]any{
			"name": "Second", "type": "checking",
		}, &created)
		if w.Code != http.StatusCreated {
			t.Fatalf("create second: %d", w.Code)
		}
		secondID := created.ID

		var resp map[string]any
		w = s.DoJSON(t, http.MethodPost, "/api/accounts/reorder", map[string]any{
			"order": []string{secondID, id},
		}, &resp)
		if w.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200 (body: %s)", w.Code, w.Body.String())
		}
		if ok, _ := resp["ok"].(bool); !ok {
			t.Errorf("ok = %v, want true", resp["ok"])
		}
	})

	t.Run("malformed body returns 400", func(t *testing.T) {
		s, _ := loginAsAdmin(t)
		// Send a body without the required 'order' field.
		w := s.DoJSON(t, http.MethodPost, "/api/accounts/reorder", map[string]any{}, nil)
		if w.Code != http.StatusBadRequest {
			t.Errorf("status = %d, want 400 (body: %s)", w.Code, w.Body.String())
		}
	})

	t.Run("returns 401 without auth cookie", func(t *testing.T) {
		s := testutil.NewServer(t)
		w := s.DoJSON(t, http.MethodPost, "/api/accounts/reorder",
			map[string]any{"order": []string{}}, nil)
		if w.Code != http.StatusUnauthorized {
			t.Errorf("status = %d, want 401", w.Code)
		}
	})
}

// --- TestAccounts_Balances_HTTP -------------------------------------------

func TestAccounts_Balances_HTTP(t *testing.T) {
	t.Run("empty account with no transactions returns initial balance", func(t *testing.T) {
		s, _ := loginAsAdmin(t)
		// Default seeded account has initialBalance=0.
		var resp []models.AccountWithBalance
		w := s.DoJSON(t, http.MethodGet, "/api/accounts/balances", nil, &resp)
		if w.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200", w.Code)
		}
		if len(resp) != 1 {
			t.Fatalf("len = %d, want 1", len(resp))
		}
		if resp[0].Balance != 0 {
			t.Errorf("balance = %d, want 0", resp[0].Balance)
		}
	})

	t.Run("account with one income transaction reflects initial + income", func(t *testing.T) {
		s, _ := loginAsAdmin(t)
		accountID := s.SeededAccountID(t)

		// Add an income transaction.
		w := s.DoJSON(t, http.MethodPost, "/api/transactions", map[string]any{
			"accountId": accountID,
			"kind":      "income",
			"amount":    1234,
			"date":      "2026-06-01",
		}, nil)
		if w.Code != http.StatusCreated {
			t.Fatalf("create tx: %d %s", w.Code, w.Body.String())
		}

		var resp []models.AccountWithBalance
		w = s.DoJSON(t, http.MethodGet, "/api/accounts/balances", nil, &resp)
		if w.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200", w.Code)
		}
		if len(resp) != 1 {
			t.Fatalf("len = %d, want 1", len(resp))
		}
		if resp[0].Balance != 1234 {
			t.Errorf("balance = %d, want 1234 (initial 0 + income 1234)", resp[0].Balance)
		}
	})

	t.Run("account with one expense transaction reflects initial - expense", func(t *testing.T) {
		s, _ := loginAsAdmin(t)
		accountID := s.SeededAccountID(t)

		w := s.DoJSON(t, http.MethodPost, "/api/transactions", map[string]any{
			"accountId": accountID,
			"kind":      "expense",
			"amount":    -500,
			"date":      "2026-06-02",
		}, nil)
		if w.Code != http.StatusCreated {
			t.Fatalf("create tx: %d %s", w.Code, w.Body.String())
		}

		var resp []models.AccountWithBalance
		w = s.DoJSON(t, http.MethodGet, "/api/accounts/balances", nil, &resp)
		if w.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200", w.Code)
		}
		if len(resp) != 1 {
			t.Fatalf("len = %d, want 1", len(resp))
		}
		if resp[0].Balance != -500 {
			t.Errorf("balance = %d, want -500", resp[0].Balance)
		}
	})

	t.Run("returns 401 without auth cookie", func(t *testing.T) {
		s := testutil.NewServer(t)
		w := s.DoJSON(t, http.MethodGet, "/api/accounts/balances", nil, nil)
		if w.Code != http.StatusUnauthorized {
			t.Errorf("status = %d, want 401", w.Code)
		}
	})
}
