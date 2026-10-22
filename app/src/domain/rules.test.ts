import { describe, expect, it } from 'vitest';
import { dueAlert, isWeakPin, lotCode, readingStatus, useBy, worstAlert } from './rules';

describe('readingStatus (identique au serveur)', () => {
  it('frigo 0–4 °C', () => {
    expect(readingStatus(3.0, 0, 4)).toBe('vert');
    expect(readingStatus(3.7, 0, 4)).toBe('jaune');
    expect(readingStatus(4.0, 0, 4)).toBe('jaune');
    expect(readingStatus(4.1, 0, 4)).toBe('rouge');
    expect(readingStatus(-0.1, 0, 4)).toBe('rouge');
  });
  it('congélateur ≤ −18 °C', () => {
    expect(readingStatus(-20, null, -18)).toBe('vert');
    expect(readingStatus(-18.3, null, -18)).toBe('jaune');
    expect(readingStatus(-17.9, null, -18)).toBe('rouge');
  });
  it('maintien ≥ 65 °C', () => {
    expect(readingStatus(68, 65, null)).toBe('vert');
    expect(readingStatus(64.9, 65, null)).toBe('rouge');
  });
});

describe('alertes d’échéance', () => {
  const now = new Date('2026-10-22T12:00:00');
  it('jaune 15 min avant, rouge après', () => {
    expect(dueAlert(new Date('2026-10-22T12:30:00'), now)).toBe('ok');
    expect(dueAlert(new Date('2026-10-22T12:12:00'), now)).toBe('jaune');
    expect(dueAlert(new Date('2026-10-22T11:59:00'), now)).toBe('rouge');
  });
  it('le rouge l’emporte', () => {
    expect(worstAlert(['ok', 'jaune', 'rouge'])).toBe('rouge');
    expect(worstAlert(['ok', 'jaune'])).toBe('jaune');
    expect(worstAlert([])).toBe('ok');
  });
});

describe('lots et codes', () => {
  it('format CODE-JJMMAA-n et J+2', () => {
    const d = new Date(2026, 9, 22);
    expect(lotCode('JAL', d, 1)).toBe('JAL-221026-1');
    expect(useBy(d, 2).getDate()).toBe(24);
  });
  it('codes faciles refusés', () => {
    for (const p of ['1234', '0000', '9876', '7777', '12a4']) expect(isWeakPin(p)).toBe(true);
    expect(isWeakPin('4827')).toBe(false);
  });
});
