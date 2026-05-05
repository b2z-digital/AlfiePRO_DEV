type Listener = (table: string, operation: string) => void;

const listeners = new Set<Listener>();

export function onDataChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function emitDataChange(table: string, operation: 'insert' | 'update' | 'delete' | 'upsert' = 'update') {
  listeners.forEach(fn => {
    try { fn(table, operation); } catch (e) { console.error('dataEvents listener error:', e); }
  });
}
