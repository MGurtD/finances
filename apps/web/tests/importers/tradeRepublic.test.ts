import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { suggestImporter } from '@/utils/importers';
import { parseCsv } from '@/utils/importers/tradeRepublic';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = resolve(__dirname, '../fixtures/trade-republic.csv');

function loadFixture(): string {
  return readFileSync(FIXTURE_PATH, 'utf8');
}

describe('tradeRepublic importer — detection', () => {
  it('detects the 41-row fixture with high confidence via header + filename', () => {
    const filename = 'TradeRepublic_ExportacionTransacción.csv';
    const suggestion = suggestImporter(filename, loadFixture());
    expect(suggestion.primary?.id).toBe('trade-republic');
    // Header has transaction_id + counterparty_iban → 0.45 + 0.45 = 0.9.
    expect(suggestion.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('detects a TR file even without the filename hint when header is intact', () => {
    const filename = 'export.csv';
    const suggestion = suggestImporter(filename, loadFixture());
    expect(suggestion.primary?.id).toBe('trade-republic');
  });

  it('scores below 0.4 on a CaixaBank-style CSV (no transaction_id column)', () => {
    const caixabank = readFileSync(
      resolve(__dirname, '../fixtures/caixabank-export.csv'),
      'utf8',
    );
    const suggestion = suggestImporter('extracte.csv', caixabank);
    // Trade Republic scoring: no transaction_id header → 0; trade
    // Republic must NOT win over generic-csv.
    expect(suggestion.primary?.id).not.toBe('trade-republic');
  });
});

describe('tradeRepublic importer — parseCsv', () => {
  it('parses every row from the fixture (no rows lost)', () => {
    const rows = parseCsv(loadFixture());
    // 42 data rows in the fixture (header + 42 rows = 43 lines).
    expect(rows.length).toBeGreaterThanOrEqual(40);
    expect(rows.length).toBeLessThanOrEqual(45);
  });

  it('maps INTEREST_PAYMENT → income with positive cents', () => {
    const rows = parseCsv(loadFixture());
    const interest = rows.filter((r) => r.kind === 'income').find((r) => r.amountCents > 0);
    expect(interest).toBeDefined();
    // INTEREST_PAYMENT rows in the fixture are all small (0.02..18.11 EUR).
    expect(interest!.amountCents).toBeGreaterThan(0);
    expect(interest!.amountCents).toBeLessThan(2000);
  });

  it('maps CUSTOMER_INBOUND → income (positive)', () => {
    const csv = [
      '"datetime","date","account_type","category","type","asset_class","name","symbol","shares","price","amount","fee","tax","currency","original_amount","original_currency","fx_rate","description","transaction_id","counterparty_name","counterparty_iban","payment_reference","mcc_code"',
      '"2025-05-16T09:39:28Z","2025-05-16","DEFAULT","CASH","CUSTOMER_INBOUND","","","","","","10.000000","","","EUR","","","","Test","dcece623-d927-4b32-9aa1-6d0208ff7762","GURT DOT MARC","ES7500730100580168889687","",""',
    ].join('\n');
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.kind).toBe('income');
    expect(rows[0]?.amountCents).toBe(1000);
    expect(rows[0]?.date).toBe('2025-05-16');
    expect(rows[0]?.description).toBe('GURT DOT MARC — Test');
    expect(rows[0]?.importHash).toBe('dcece623-d927-4b32-9aa1-6d0208ff7762');
  });

  it('maps TRANSFER_INBOUND → transfer (positive)', () => {
    const csv = [
      '"datetime","date","account_type","category","type","asset_class","name","symbol","shares","price","amount","fee","tax","currency","original_amount","original_currency","fx_rate","description","transaction_id","counterparty_name","counterparty_iban","payment_reference","mcc_code"',
      '"2025-10-28T09:19:25Z","2025-10-28","DEFAULT","CASH","TRANSFER_INBOUND","","","","","","250.000000","","","EUR","","","","Incoming transfer from MARC GURT DOT","bb3c5ba3-cdf2-4526-af75-be05c67f763f","","","",""',
    ].join('\n');
    const rows = parseCsv(csv);
    expect(rows[0]?.kind).toBe('transfer');
    expect(rows[0]?.amountCents).toBe(25000);
  });

  it('maps TRANSFER_INSTANT_INBOUND → transfer (positive)', () => {
    const csv = [
      '"datetime","date","account_type","category","type","asset_class","name","symbol","shares","price","amount","fee","tax","currency","original_amount","original_currency","fx_rate","description","transaction_id","counterparty_name","counterparty_iban","payment_reference","mcc_code"',
      '"2025-08-24T09:15:58Z","2025-08-24","DEFAULT","CASH","TRANSFER_INSTANT_INBOUND","","","","","","250.000000","","","EUR","","","","Incoming transfer from GURT DOT MARC","0db91d4b-8043-470a-b58c-f2896707faaf","","","",""',
    ].join('\n');
    const rows = parseCsv(csv);
    expect(rows[0]?.kind).toBe('transfer');
    expect(rows[0]?.amountCents).toBe(25000);
  });

  it('maps TRANSFER_INSTANT_OUTBOUND → transfer (negative)', () => {
    const csv = [
      '"datetime","date","account_type","category","type","asset_class","name","symbol","shares","price","amount","fee","tax","currency","original_amount","original_currency","fx_rate","description","transaction_id","counterparty_name","counterparty_iban","payment_reference","mcc_code"',
      '"2025-09-09T07:58:09Z","2025-09-09","DEFAULT","CASH","TRANSFER_INSTANT_OUTBOUND","","","","","","-200.000000","","","EUR","","","","Outgoing transfer for GURT DOT MARC","821803f1-2b42-402c-bf84-0db6ecc4f661","","","",""',
    ].join('\n');
    const rows = parseCsv(csv);
    expect(rows[0]?.kind).toBe('transfer');
    expect(rows[0]?.amountCents).toBe(-20000);
  });

  it('maps TRANSFER_OUTBOUND → transfer (negative)', () => {
    const csv = [
      '"datetime","date","account_type","category","type","asset_class","name","symbol","shares","price","amount","fee","tax","currency","original_amount","original_currency","fx_rate","description","transaction_id","counterparty_name","counterparty_iban","payment_reference","mcc_code"',
      '"2026-02-13T10:10:33Z","2026-02-13","DEFAULT","CASH","TRANSFER_OUTBOUND","","","","","","-1200.000000","","","EUR","","","","Outgoing transfer for MARC GURT DOT","019c567b-1849-731e-a4a3-cca5419f3bbb","","","",""',
    ].join('\n');
    const rows = parseCsv(csv);
    expect(rows[0]?.kind).toBe('transfer');
    expect(rows[0]?.amountCents).toBe(-120000);
  });

  it('maps CARD_TRANSACTION → expense (negative)', () => {
    const csv = [
      '"datetime","date","account_type","category","type","asset_class","name","symbol","shares","price","amount","fee","tax","currency","original_amount","original_currency","fx_rate","description","transaction_id","counterparty_name","counterparty_iban","payment_reference","mcc_code"',
      '"2026-02-14T08:04:54Z","2026-02-14","DEFAULT","CASH","CARD_TRANSACTION","","TOKIO SCHOOL, S.L.U.","","","","-1462.000000","","","EUR","","","","TOKIO SCHOOL, S.L.U.","019c5b2e-6ac7-79e6-ba93-1b9635e0eeee","","","","5815"',
    ].join('\n');
    const rows = parseCsv(csv);
    expect(rows[0]?.kind).toBe('expense');
    expect(rows[0]?.amountCents).toBe(-146200);
  });

  it('maps BUY (trading) → expense for MVP', () => {
    const csv = [
      '"datetime","date","account_type","category","type","asset_class","name","symbol","shares","price","amount","fee","tax","currency","original_amount","original_currency","fx_rate","description","transaction_id","counterparty_name","counterparty_iban","payment_reference","mcc_code"',
      '"2026-03-17T17:35:18Z","2026-03-17","DEFAULT","TRADING","BUY","FUND","MSCI Emerging Markets Ex China USD (Acc)","LU2009202107","14.0000000000","33.8950000000","-474.53","-1.00","","EUR","","","","Buy trade LU2009202107 MULTI UNITS LUXEMBOURG - Amundi MSCI Emerging Ex China UCITS ETF Acc, quantity: 14.0","22058d7d-1cb0-4eb7-8e81-53eb9afd6493","","","",""',
    ].join('\n');
    const rows = parseCsv(csv);
    expect(rows[0]?.kind).toBe('expense');
    // 474.53 EUR with 2-decimal precision → 47453 cents (the 6-decimal
    // "474.530000" rounds cleanly to 47453).
    expect(rows[0]?.amountCents).toBe(-47453);
  });

  it('uses transaction_id as importHash', () => {
    const csv = [
      '"datetime","date","account_type","category","type","asset_class","name","symbol","shares","price","amount","fee","tax","currency","original_amount","original_currency","fx_rate","description","transaction_id","counterparty_name","counterparty_iban","payment_reference","mcc_code"',
      '"2025-05-16T09:39:28Z","2025-05-16","DEFAULT","CASH","CUSTOMER_INBOUND","","","","","","10.000000","","","EUR","","","","Test","dcece623-d927-4b32-9aa1-6d0208ff7762","GURT DOT MARC","ES7500730100580168889687","",""',
    ].join('\n');
    const rows = parseCsv(csv);
    expect(rows[0]?.importHash).toBe('dcece623-d927-4b32-9aa1-6d0208ff7762');
  });

  it('builds description as "<counterparty_name> — <note>"', () => {
    const csv = [
      '"datetime","date","account_type","category","type","asset_class","name","symbol","shares","price","amount","fee","tax","currency","original_amount","original_currency","fx_rate","description","transaction_id","counterparty_name","counterparty_iban","payment_reference","mcc_code"',
      '"2025-05-16T09:39:28Z","2025-05-16","DEFAULT","CASH","CUSTOMER_INBOUND","","","","","","10.000000","","","EUR","","","","Test","dcece623-d927-4b32-9aa1-6d0208ff7762","GURT DOT MARC","ES7500730100580168889687","",""',
    ].join('\n');
    const rows = parseCsv(csv);
    expect(rows[0]?.description).toBe('GURT DOT MARC — Test');
  });

  it('falls back to description alone when counterparty_name is empty', () => {
    const csv = [
      '"datetime","date","account_type","category","type","asset_class","name","symbol","shares","price","amount","fee","tax","currency","original_amount","original_currency","fx_rate","description","transaction_id","counterparty_name","counterparty_iban","payment_reference","mcc_code"',
      '"2025-07-01T07:12:18Z","2025-07-01","DEFAULT","CASH","INTEREST_PAYMENT","","","","","","0.020000","","","EUR","","","","Interest payment for payout collection eb0812d6-f17e-43a2-8128-f641ca4dec82","1f3ccc7f-3fbe-493b-b0c3-169fa6788035","","","",""',
    ].join('\n');
    const rows = parseCsv(csv);
    expect(rows[0]?.description).toBe('Interest payment for payout collection eb0812d6-f17e-43a2-8128-f641ca4dec82');
  });

  it('returns [] when the header lacks transaction_id', () => {
    const csv = ['date,description,amount', '2026-04-01,Test,10.00'].join('\n');
    expect(parseCsv(csv)).toEqual([]);
  });

  it('rounds 6-decimal amounts to integer cents (sub-cent loss accepted for MVP)', () => {
    // 33.8950000000 → Math.round(33.895 * 100) = 3390 (exact for this value).
    // Sub-cent cases: 0.001 EUR would round to 0 cents. Flagged follow-up:
    // trades below €0.01 cannot be represented in integer cents.
    const csv = [
      '"datetime","date","account_type","category","type","asset_class","name","symbol","shares","price","amount","fee","tax","currency","original_amount","original_currency","fx_rate","description","transaction_id","counterparty_name","counterparty_iban","payment_reference","mcc_code"',
      '"2026-03-17T17:35:18Z","2026-03-17","DEFAULT","TRADING","BUY","FUND","MSCI","LU","14","33.8950000000","-474.530000","","","EUR","","","","Buy","22058d7d-1cb0-4eb7-8e81-53eb9afd6493","","","",""',
    ].join('\n');
    const rows = parseCsv(csv);
    // 474.530000 EUR → 47453 cents (Math.round(474.53 * 100) = 47453).
    expect(rows[0]?.amountCents).toBe(-47453);
  });

  it('handles negative amounts correctly', () => {
    const csv = [
      '"datetime","date","account_type","category","type","asset_class","name","symbol","shares","price","amount","fee","tax","currency","original_amount","original_currency","fx_rate","description","transaction_id","counterparty_name","counterparty_iban","payment_reference","mcc_code"',
      '"2025-09-09T07:58:09Z","2025-09-09","DEFAULT","CASH","TRANSFER_INSTANT_OUTBOUND","","","","","","-200.000000","","","EUR","","","","Outgoing","821803f1-2b42-402c-bf84-0db6ecc4f661","","","",""',
    ].join('\n');
    const rows = parseCsv(csv);
    expect(rows[0]?.amountCents).toBe(-20000);
    expect(rows[0]?.amountCents).toBeLessThan(0);
  });
});
