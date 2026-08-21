import { describe, it, expect } from 'vitest';
import { generateLeadKey } from '../src/utils/keyGen.js';
import { columnIndexToLetter } from '../src/services/sheetsClient.js';
import { SHEET_COLUMNS, IMPORT_FIELDS, WRITEBACK_FIELDS, KEY_FIELD } from '../src/config/sheetMapping.js';

describe('lead key generation', () => {
  it('builds FirstName-City-lastTwoDigits from a full record', () => {
    expect(generateLeadKey({ name: 'Surender Kumar', city: 'Sonipat', mob: '9876543231' })).toBe('Surender-Sonipat-31');
  });

  it('uses only the first name when multiple words are given', () => {
    expect(generateLeadKey({ name: 'Priya Sharma', city: 'Ahmedabad', mob: '9000000005' })).toBe('Priya-Ahmedabad-05');
  });

  it('strips non-digit characters from the phone number before taking the last two digits', () => {
    expect(generateLeadKey({ name: 'Ravi', city: 'Pune', mob: '+91 90000-00099' })).toBe('Ravi-Pune-99');
  });

  it('falls back gracefully when fields are missing', () => {
    expect(generateLeadKey({ name: '', city: '', mob: '' })).toBe('Unknown-Unknown-00');
  });
});

describe('sheet column mapping', () => {
  it('splits columns into import (sheet -> CRM) and writeback (CRM -> sheet) sets with no overlap', () => {
    const overlap = IMPORT_FIELDS.filter((f) => WRITEBACK_FIELDS.includes(f));
    expect(overlap).toHaveLength(0);
    expect(IMPORT_FIELDS.length + WRITEBACK_FIELDS.length).toBe(SHEET_COLUMNS.length);
  });

  it('includes the unique key column as import-only', () => {
    expect(IMPORT_FIELDS).toContain(KEY_FIELD);
  });

  it('marks the employee working fields as writeback', () => {
    for (const field of ['status', 'priority', 'notes', 'last_contacted', 'next_follow_up']) {
      expect(WRITEBACK_FIELDS).toContain(field);
    }
  });
});

describe('columnIndexToLetter', () => {
  it('converts 0-indexed column numbers to A1 letters', () => {
    expect(columnIndexToLetter(0)).toBe('A');
    expect(columnIndexToLetter(25)).toBe('Z');
    expect(columnIndexToLetter(26)).toBe('AA');
    expect(columnIndexToLetter(27)).toBe('AB');
    expect(columnIndexToLetter(51)).toBe('AZ');
  });
});
