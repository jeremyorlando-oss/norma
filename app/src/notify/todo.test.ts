import { describe, expect, it } from 'vitest';
import { sortTodo, tabBadge, todoLabel, type TodoItem } from './todo';

const items: TodoItem[] = [
  { id: 'documents', kind: 'documents', n: 2, urgent: false, tab: 'documents' },
  { id: 'signer:1', kind: 'signer', n: 1, urgent: true, tab: 'documents', detail: 'Contrat' },
  { id: 'profil', kind: 'profil', n: 1, urgent: false, tab: 'profil', missing: 3 },
];
describe('à faire', () => {
  it('pastille par onglet : total et urgence', () => {
    expect(tabBadge(items, 'documents')).toEqual({ badge: 3, fire: true });
    expect(tabBadge(items, 'profil')).toEqual({ badge: 1, fire: false });
    expect(tabBadge(items, 'heures')).toEqual({ badge: 0, fire: false });
  });
  it('urgent en premier, libellés', () => {
    expect(sortTodo(items)[0].kind).toBe('signer');
    expect(todoLabel(items[1])).toEqual(['À signer : {x}', { x: 'Contrat' }]);
    expect(todoLabel(items[2])[1]).toEqual({ n: 3 });
  });
});
