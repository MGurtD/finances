import { describe, expect, it } from 'vitest';
import { parseOfx } from '@/utils/importers/ofx';

const OFX_HEADER = 'OFXHEADER:100\n';
const OFX_BODY = `DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:USASCII
CHARSET:1252
COMPRESSION:NONE
OLDFILEUID:NONE
NEWFILEUID:NONE

<OFX>
<SIGNONMSGSRSV1>
<SONRS>
<STATUS>
<CODE>0
<SEVERITY>INFO
</STATUS>
<DTSERVER>20260415120000
<LANGUAGE>ENG
</SONRS>
</SIGNONMSGSRSV1>
<BANKMSGSRSV1>
<STMTTRNRS>
<TRNUID>1
<STATUS><CODE>0<SEVERITY>INFO</STATUS>
<STMTRS>
<CURDEF>EUR
<BANKACCTFROM>
<BANKID>1234
<ACCTID>5678
<ACCTTYPE>CHECKING
</BANKACCTFROM>
<BANKTRANLIST>
<DTSTART>20260401
<DTEND>20260430
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260402120000
<TRNAMT>-42.50
<FITID>OFX-001
<NAME>COFFEE SHOP
<MEMO>Espresso
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260405120000
<TRNAMT>2500.00
<FITID>OFX-002
<NAME>EMPLOYER
<MEMO>Salary April
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260410120000
<TRNAMT>-99.99
<FITID>OFX-003
<NAME>GROCERIES
</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL>
<BALAMT>1234.56
<DTASOF>20260430120000
</LEDGERBAL>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>
`;

const OFX_DOC = OFX_HEADER + OFX_BODY;

describe('parseOfx', () => {
  it('parses STMTTRN entries with dates, cents, and descriptions', async () => {
    const rows = await parseOfx(OFX_DOC);
    expect(rows).toHaveLength(3);

    expect(rows[0]).toMatchObject({
      date: '2026-04-02',
      description: 'COFFEE SHOP',
      amountCents: 4250,
      kind: 'expense',
    });
    expect(rows[1]).toMatchObject({
      date: '2026-04-05',
      description: 'EMPLOYER',
      amountCents: 250000,
      kind: 'income',
    });
    expect(rows[2]).toMatchObject({
      date: '2026-04-10',
      description: 'GROCERIES',
      amountCents: 9999,
      kind: 'expense',
    });
  });

  it('falls back to MEMO when NAME is missing', async () => {
    // Build a doc with no <NAME> tags so only MEMO is present.
    const doc = OFX_HEADER + OFX_BODY.replace(/<NAME>[^<]*\n/g, '');
    const rows = await parseOfx(doc);
    // Two rows now rely on MEMO.
    expect(rows[0]?.description).toBe('Espresso');
    expect(rows[1]?.description).toBe('Salary April');
    // Third had no MEMO and no NAME → must be skipped.
    expect(rows).toHaveLength(2);
  });

  it('does not emit importHash for OFX rows (caller adds if needed)', async () => {
    const rows = await parseOfx(OFX_DOC);
    for (const r of rows) {
      expect(r.importHash).toBeUndefined();
    }
  });
});
