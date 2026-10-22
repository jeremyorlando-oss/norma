import { describe, expect, it } from 'vitest';
import { breakMinutes, checkEntry, fmtMin, workedMinutes } from './hours';
const d = (h: number, m = 0) => new Date(2026, 9, 22, h, m);
describe('heures', () => {
  it('déduit les pauses', () => {
    const e = { start: d(10), end: d(18), breaks: [{ start: d(13), end: d(13, 45) }] };
    expect(workedMinutes(e, d(20))).toBe(435); expect(breakMinutes(e, d(20))).toBe(45); expect(fmtMin(435)).toBe('7 h 15');
  });
  it('service et pause en cours', () => {
    expect(workedMinutes({ start: d(10), end: null, breaks: [{ start: d(12), end: null }] }, d(12, 30))).toBe(120);
  });
  it('refuse les incohérences', () => {
    expect(checkEntry({ start: d(10), end: d(9), breaks: [] })).toMatch(/après/);
    expect(checkEntry({ start: d(10), end: d(18), breaks: [{ start: d(19), end: d(19, 30) }] })).toMatch(/dehors/);
    expect(checkEntry({ start: d(10), end: d(18), breaks: [{ start: d(12), end: d(12, 30) }] })).toBeNull();
  });
});
