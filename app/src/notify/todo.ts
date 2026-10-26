// Liste « à faire » d'une personne (rpc_mes_a_faire, migration 012) : pastilles par onglet et carte « À faire ».
export type TodoKind = 'signer' | 'documents' | 'planning' | 'profil' | 'notice' | 'formation';
export type TodoTab = 'planning' | 'heures' | 'documents' | 'profil';
export interface TodoItem { id: string; kind: TodoKind; n: number; urgent: boolean; tab: TodoTab; detail?: string; missing?: number }
export interface Todo { items: TodoItem[]; badge: number; nc: number }
export const EMPTY_TODO: Todo = { items: [], badge: 0, nc: 0 };

/** Pastille d'un onglet : total à faire, « feu » si au moins une chose urgente. */
export function tabBadge(items: TodoItem[], tab: TodoTab) {
  const mine = items.filter((i) => i.tab === tab);
  return { badge: mine.reduce((s, i) => s + i.n, 0), fire: mine.some((i) => i.urgent) };
}

/** Texte de la ligne (clé française, traduite par t()). Urgent en premier. */
export function todoLabel(i: TodoItem): [string, Record<string, string | number>?] {
  switch (i.kind) {
    case 'signer': return ['À signer : {x}', { x: i.detail ?? '' }];
    case 'documents': return [i.n > 1 ? '{n} nouveaux documents à ouvrir' : 'Nouveau document à ouvrir', { n: i.n }];
    case 'planning': return [i.n > 1 ? '{n} nouveaux événements au planning' : 'Nouvel événement au planning', { n: i.n }];
    case 'profil': return ['Compléter ma fiche personnelle ({n} champ(s) manquant(s))', { n: i.missing ?? 0 }];
    case 'notice': return ['Lire la notice de protection des données'];
    case 'formation': return ['Formation hygiène à faire (tablette du stand)'];
  }
}
export const sortTodo = (items: TodoItem[]) => [...items].sort((a, b) => Number(b.urgent) - Number(a.urgent));
