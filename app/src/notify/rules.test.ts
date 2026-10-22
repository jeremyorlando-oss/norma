import { describe, expect, it } from 'vitest';
import { recipients } from './rules';
import { POSTES } from '../api/demo';
const people = [['g', 'Gérant'], ['m', 'Manager'], ['c', 'Chef de cuisine'], ['a', 'Aide de cuisine']].map(([id, poste]) => ({ id, poste, rights: POSTES[poste] }));
describe('notifications', () => {
  it('urgences au Gérant et au Manager', () => expect(recipients('temperature_hors_seuil', people)).toEqual(['g', 'm']));
  it('jamais aux postes du stand', () => expect(recipients('incident', people)).not.toContain('c'));
  it('rapport du soir : Gérant et Manager', () => expect(recipients('rapport_soir', people)).toEqual(['g', 'm']));
});
