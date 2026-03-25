import { useState, useCallback } from 'react';
import styles from './ModMatrixUI.module.css';
import { useSynthStore } from '../../stores/synthStore';
import {
  addModulationRoute,
  updateModulationRoute,
  removeModulationRoute,
} from '../../utils/tauri-commands';

const SOURCES = [
  { index: 0, label: 'Env 1' },
  { index: 1, label: 'Env 2 (Filtre)' },
  { index: 2, label: 'LFO 1' },
  { index: 3, label: 'LFO 2' },
  { index: 4, label: 'Velocity' },
  { index: 5, label: 'Note' },
];

const DESTINATIONS = [
  { index: 0, label: 'Pitch' },
  { index: 1, label: 'Cutoff' },
  { index: 2, label: 'Volume' },
  { index: 3, label: 'Pan' },
  { index: 4, label: 'Osc2 Pitch' },
  { index: 5, label: 'Reso' },
];

interface Route {
  id: number;
  source: number;
  destination: number;
  amount: number;
}

const MAX_ROUTES = 8;

/**
 * Matrice de modulation simplifiée : tableau de routages source → destination → amount.
 */
export function ModMatrixUI() {
  const { trackId } = useSynthStore();
  const [routes, setRoutes] = useState<Route[]>([]);

  const handleAdd = useCallback(async () => {
    if (trackId === null || routes.length >= MAX_ROUTES) return;
    try {
      const id = await addModulationRoute(trackId, 4, 1, 0.5); // Velocity → Cutoff default
      setRoutes(prev => [...prev, { id, source: 4, destination: 1, amount: 0.5 }]);
    } catch (err) {
      console.error('[ModMatrix] add failed:', err);
    }
  }, [trackId, routes.length]);

  const handleRemove = useCallback(async (routeId: number) => {
    if (trackId === null) return;
    try {
      await removeModulationRoute(trackId, routeId);
      setRoutes(prev => prev.filter(r => r.id !== routeId));
    } catch (err) {
      console.error('[ModMatrix] remove failed:', err);
    }
  }, [trackId]);

  const handleSourceChange = useCallback(async (routeId: number, source: number) => {
    if (trackId === null) return;
    setRoutes(prev => prev.map(r => r.id === routeId ? { ...r, source } : r));
    // Re-create the route with new source (backend doesn't support source update, so remove+add)
    const route = routes.find(r => r.id === routeId);
    if (!route) return;
    try {
      await removeModulationRoute(trackId, routeId);
      const newId = await addModulationRoute(trackId, source, route.destination, route.amount);
      setRoutes(prev => prev.map(r => r.id === routeId ? { ...r, id: newId, source } : r));
    } catch (err) {
      console.error('[ModMatrix] source change failed:', err);
    }
  }, [trackId, routes]);

  const handleDestChange = useCallback(async (routeId: number, destination: number) => {
    if (trackId === null) return;
    setRoutes(prev => prev.map(r => r.id === routeId ? { ...r, destination } : r));
    const route = routes.find(r => r.id === routeId);
    if (!route) return;
    try {
      await removeModulationRoute(trackId, routeId);
      const newId = await addModulationRoute(trackId, route.source, destination, route.amount);
      setRoutes(prev => prev.map(r => r.id === routeId ? { ...r, id: newId, destination } : r));
    } catch (err) {
      console.error('[ModMatrix] dest change failed:', err);
    }
  }, [trackId, routes]);

  const handleAmountChange = useCallback(async (routeId: number, amount: number) => {
    if (trackId === null) return;
    setRoutes(prev => prev.map(r => r.id === routeId ? { ...r, amount } : r));
    try {
      await updateModulationRoute(trackId, routeId, amount);
    } catch (err) {
      console.error('[ModMatrix] amount change failed:', err);
    }
  }, [trackId]);

  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <h3 className={styles.title}>Mod Matrix</h3>
        {routes.length < MAX_ROUTES && (
          <button className={styles.addBtn} onClick={handleAdd} title="Ajouter un routage">+</button>
        )}
      </div>

      {routes.length === 0 && (
        <div className={styles.empty}>Aucun routage. Cliquez + pour ajouter.</div>
      )}

      {routes.map(route => (
        <div key={route.id} className={styles.routeRow}>
          <select
            className={styles.select}
            value={route.source}
            onChange={e => handleSourceChange(route.id, Number(e.target.value))}
          >
            {SOURCES.map(s => <option key={s.index} value={s.index}>{s.label}</option>)}
          </select>

          <span className={styles.arrow}>→</span>

          <select
            className={styles.select}
            value={route.destination}
            onChange={e => handleDestChange(route.id, Number(e.target.value))}
          >
            {DESTINATIONS.map(d => <option key={d.index} value={d.index}>{d.label}</option>)}
          </select>

          <input
            type="range"
            className={styles.slider}
            min={-1}
            max={1}
            step={0.01}
            value={route.amount}
            onChange={e => handleAmountChange(route.id, parseFloat(e.target.value))}
            title={`Amount: ${route.amount.toFixed(2)}`}
          />
          <span className={styles.amountLabel}>{route.amount.toFixed(2)}</span>

          <button className={styles.removeBtn} onClick={() => handleRemove(route.id)} title="Supprimer">✕</button>
        </div>
      ))}
    </section>
  );
}
