import { describe, expect, it } from 'vitest';
import { ageAt, computePayslip, DEFAULT_SETTINGS, type PayInput } from './paie';

const S = { ...DEFAULT_SETTINGS, aanpPct: 1.2 };
const base: PayInput = { month: '2026-08', minutes: 40 * 60, hourlyRate: 23, birthDate: '2004-12-23', permit: 'CH', sourceTaxPct: null,
  avsOnRequest: false, ytdGross: 2000, ytdAvsBase: 0, ytdAcBase: 0 };

describe('fiche de salaire', () => {
  it('âge révolu en fin de mois', () => { expect(ageAt('2004-12-23', '2026-08')).toBe(21); expect(ageAt('2006-08-31', '2026-08')).toBe(20); });
  it('le détail du brut fait exactement le brut', () => {
    const r = computePayslip({ ...base, avsOnRequest: true }, S);
    expect(r.gross).toBe(920);
    expect(r.earnings.reduce((n, l) => n + l.amount, 0)).toBeCloseTo(920, 2);
  });
  it('sous 2 500 CHF/an : pas d’AVS ni d’AC sauf demande', () => {
    const r = computePayslip({ ...base, ytdGross: 0 }, S);
    expect(r.avsBase).toBe(0); expect(r.deductions.map((d) => d.label.slice(0, 3))).toEqual(['Acc']);
    expect(computePayslip({ ...base, ytdGross: 0, avsOnRequest: true }, S).avsBase).toBe(920);
  });
  it('dépassement du seuil : cotisations sur toute l’année', () => {
    const r = computePayslip(base, S);   // 2000 + 920 > 2500
    expect(r.avsBase).toBe(2920);
    expect(r.deductions[0].amount).toBe(154.75);   // 5,3 % de 2 920 = 154,76 → 154,75
  });
  it('moins de 20 ans : vacances 10,64 %', () => {
    expect(computePayslip({ ...base, birthDate: '2008-01-10' }, S).earnings[1].label).toContain('10,64');
  });
  it('mineur de moins de 18 ans dans l’année : pas d’AVS', () => {
    expect(computePayslip({ ...base, birthDate: '2009-03-01', avsOnRequest: true }, S).avsBase).toBe(0);
  });
  it('permis B : impôt à la source obligatoire', () => {
    expect(computePayslip({ ...base, permit: 'B' }, S).errors.join()).toContain('impôt à la source');
    const r = computePayslip({ ...base, permit: 'B', sourceTaxPct: 4.5, avsOnRequest: true }, S);
    expect(r.deductions[r.deductions.length - 1].amount).toBe(41.4);
  });
  it('taux AANP manquant : bloqué', () => {
    expect(computePayslip(base, DEFAULT_SETTINGS).errors.join()).toContain('AANP');
  });
});
