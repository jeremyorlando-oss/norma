import { describe, expect, it } from 'vitest';
import { parseLabel } from './parseLabel';
const today = new Date(2026, 9, 22);
const S = ['Carnadis Sàrl', 'Prodega', 'Aligro'];
describe('parseLabel', () => {
  it('lit lot, DLC et fournisseur', () => {
    const t = 'CARNADIS SA\nSaucisse volaille\nLOT: L2610-77\nEmballé le 20.10.2026\nÀ consommer jusqu’au : 28.10.2026';
    expect(parseLabel(t, S, today)).toEqual({ supplier: 'Carnadis Sàrl', lot: 'L2610-77', dlc: '2026-10-28' });
  });
  it('allemand, année sur 2 chiffres', () => {
    expect(parseLabel('Charge 45A12\nZu verbrauchen bis 03/11/26', S, today)).toEqual({ lot: '45A12', dlc: '2026-11-03' });
  });
  it('sans mention : la date future la plus lointaine', () => {
    expect(parseLabel('10.10.2026  30.10.2026', [], today).dlc).toBe('2026-10-30');
  });
  it('rien inventé', () => {
    expect(parseLabel('Mayonnaise 5 kg', S, today)).toEqual({});
    expect(parseLabel('31.02.2026', S, today)).toEqual({});
  });
});
