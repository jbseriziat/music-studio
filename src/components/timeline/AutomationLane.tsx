import { useCallback, useRef } from 'react';
import { useAutomationStore } from '../../stores/automationStore';
import type { AutomationParameter, AutomationPoint } from '../../stores/automationStore';
import { useTransportStore } from '../../stores/transportStore';
import styles from './AutomationLane.module.css';

// ─── Constantes ───────────────────────────────────────────────────────────────

const LANE_HEIGHT = 54;   // hauteur en px de la zone SVG
const POINT_RADIUS = 5;   // rayon des cercles draggables

/** Référence stable à un tableau vide pour éviter les re-rendus inutiles. */
const EMPTY_POINTS: AutomationPoint[] = [];

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  trackId: string;
  parameter: AutomationParameter;
  pixelsPerSec: number;
  totalSecs: number;
}

// ─── Composant ────────────────────────────────────────────────────────────────

/**
 * Courbe d'automation SVG pour une lane (volume ou pan).
 *  - Clic sur zone vide → ajoute un point
 *  - Drag sur un point → déplace le point
 *  - Double-clic sur un point → supprime le point
 */
export function AutomationLane({ trackId, parameter, pixelsPerSec, totalSecs }: Props) {
  const bpm        = useTransportStore((s) => s.bpm);
  const laneKey    = `${trackId}:${parameter}`;
  const points     = useAutomationStore((s) => s.lanes[laneKey] ?? EMPTY_POINTS);
  const { addPoint, updatePoint, deletePoint } = useAutomationStore();

  const svgRef         = useRef<SVGSVGElement>(null);
  /** Positionné à true pendant 1 frame après un drag pour ignorer le click SVG résultant. */
  const wasDraggingRef = useRef(false);

  // ── Convertisseurs beats ↔ pixels ──────────────────────────────────────────

  const secsPerBeat  = 60 / bpm;
  const beatsToX     = useCallback((beats: number) => beats * secsPerBeat * pixelsPerSec, [secsPerBeat, pixelsPerSec]);
  const valueToY     = useCallback((v: number)     => (1 - v) * LANE_HEIGHT, []);
  const xToBeats     = useCallback((x: number)     => x / (secsPerBeat * pixelsPerSec), [secsPerBeat, pixelsPerSec]);
  const yToValue     = useCallback((y: number)     => Math.max(0, Math.min(1, 1 - y / LANE_HEIGHT)), []);

  // ── Ajouter un point au clic ────────────────────────────────────────────────

  const handleSvgClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    // Ignorer si on vient de finir un drag (sinon un point se crée au mouseup)
    if (wasDraggingRef.current) {
      wasDraggingRef.current = false;
      return;
    }
    const rect  = svgRef.current!.getBoundingClientRect();
    const beats = Math.max(0, xToBeats(e.clientX - rect.left));
    const value = yToValue(e.clientY - rect.top);
    addPoint(trackId, parameter, beats, value).catch(console.error);
  }, [xToBeats, yToValue, trackId, parameter, addPoint]);

  // ── Déplacer un point par drag ──────────────────────────────────────────────

  const handlePointMouseDown = useCallback((
    e: React.MouseEvent<SVGCircleElement>,
    pt: AutomationPoint,
  ) => {
    e.stopPropagation();
    e.preventDefault();

    let curX     = e.clientX;
    let curY     = e.clientY;
    let curBeats = pt.timeBeats;
    let curValue = pt.value;
    let moved    = false;

    const onMouseMove = (ev: MouseEvent) => {
      const dx = ev.clientX - curX;
      const dy = ev.clientY - curY;
      if (!moved && Math.hypot(dx, dy) > 3) moved = true;
      if (!moved) return;

      curBeats = Math.max(0, curBeats + dx / (secsPerBeat * pixelsPerSec));
      curValue = Math.max(0, Math.min(1, curValue - dy / LANE_HEIGHT));
      curX     = ev.clientX;
      curY     = ev.clientY;

      updatePoint(trackId, parameter, pt.id, curBeats, curValue).catch(console.error);
    };

    const onMouseUp = () => {
      if (moved) wasDraggingRef.current = true;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [trackId, parameter, secsPerBeat, pixelsPerSec, updatePoint]);

  // ── Supprimer un point au double-clic ──────────────────────────────────────

  const handlePointDoubleClick = useCallback((
    e: React.MouseEvent<SVGCircleElement>,
    pt: AutomationPoint,
  ) => {
    e.stopPropagation();
    deletePoint(trackId, parameter, pt.id).catch(console.error);
  }, [trackId, parameter, deletePoint]);

  // ── Rendu SVG ──────────────────────────────────────────────────────────────

  const totalWidth = totalSecs * pixelsPerSec;
  const lineColor  = parameter === 'volume' ? '#66BB6A' : '#42A5F5';

  /** Chaîne de points pour la polyline : "x1,y1 x2,y2 ..." */
  const ptsStr = points
    .map((pt) => `${beatsToX(pt.timeBeats)},${valueToY(pt.value)}`)
    .join(' ');

  /** Polygone de remplissage fermé vers le bas de la zone */
  const fillStr = points.length > 0
    ? `0,${LANE_HEIGHT} ${ptsStr} ${beatsToX(points[points.length - 1].timeBeats)},${LANE_HEIGHT}`
    : '';

  return (
    <svg
      ref={svgRef}
      className={styles.svg}
      width={totalWidth}
      height={LANE_HEIGHT}
      onClick={handleSvgClick}
    >
      {/* Ligne de référence à 50% (centre) */}
      <line
        x1={0} y1={LANE_HEIGHT / 2}
        x2={totalWidth} y2={LANE_HEIGHT / 2}
        stroke="rgba(255,255,255,0.07)"
        strokeWidth={1}
        strokeDasharray="4,4"
      />

      {/* Zone de remplissage sous la courbe */}
      {points.length > 1 && (
        <polygon
          points={fillStr}
          fill={lineColor}
          fillOpacity={0.1}
          stroke="none"
        />
      )}

      {/* Ligne reliant les points */}
      {points.length > 1 && (
        <polyline
          points={ptsStr}
          fill="none"
          stroke={lineColor}
          strokeWidth={1.5}
          strokeOpacity={0.8}
        />
      )}

      {/* Points draggables */}
      {points.map((pt) => (
        <circle
          key={pt.id}
          cx={beatsToX(pt.timeBeats)}
          cy={valueToY(pt.value)}
          r={POINT_RADIUS}
          fill={lineColor}
          stroke="rgba(255,255,255,0.85)"
          strokeWidth={1.5}
          style={{ cursor: 'grab' }}
          /* Stopper la propagation pour ne pas déclencher handleSvgClick */
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => handlePointMouseDown(e, pt)}
          onDoubleClick={(e) => handlePointDoubleClick(e, pt)}
        />
      ))}
    </svg>
  );
}
