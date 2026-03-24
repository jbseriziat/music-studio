import { useRef, useCallback, useEffect } from 'react';
import styles from './Knob.module.css';

interface KnobProps {
  /** Valeur courante */
  value: number;
  /** Valeur minimale */
  min: number;
  /** Valeur maximale */
  max: number;
  /** Libellé affiché sous le knob */
  label: string;
  /** Valeur par défaut (double-clic reset) */
  defaultValue?: number;
  /** Taille en pixels (défaut : 48) */
  size?: number;
  /** Unité à afficher dans le tooltip */
  unit?: string;
  /** Nombre de décimales pour l'affichage */
  decimals?: number;
  /** Callback quand la valeur change */
  onChange: (value: number) => void;
}

/**
 * Potentiomètre rotatif — drag vertical pour modifier la valeur.
 * Double-clic : reset à la valeur par défaut.
 * Arc SVG de -135° à +135° (270° au total).
 */
export function Knob({
  value,
  min,
  max,
  label,
  defaultValue,
  size = 48,
  unit = '',
  decimals = 2,
  onChange,
}: KnobProps) {
  const dragRef = useRef<{ startY: number; startValue: number } | null>(null);

  // Normalise la valeur [min, max] → [0, 1]
  const norm = (max !== min) ? (value - min) / (max - min) : 0;

  // Angle en degrés : -135° (min) → +135° (max)
  const angleMin = -135;
  const angleMax = 135;
  const angle = angleMin + norm * (angleMax - angleMin);

  // Calcul de l'arc SVG
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.35;
  const strokeWidth = size * 0.08;

  const polarToXY = (deg: number) => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return {
      x: cx + r * Math.cos(rad),
      y: cy + r * Math.sin(rad),
    };
  };

  const arcPath = (startDeg: number, endDeg: number) => {
    const start = polarToXY(startDeg);
    const end = polarToXY(endDeg);
    const large = Math.abs(endDeg - startDeg) > 180 ? 1 : 0;
    const sweep = endDeg > startDeg ? 1 : 0;
    return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} ${sweep} ${end.x} ${end.y}`;
  };

  // Indicateur (petit trait sur le bord du knob)
  const indicator = polarToXY(angle);

  // ── Drag ───────────────────────────────────────────────────────────────────
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startY: e.clientY, startValue: value };

    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const dy = dragRef.current.startY - ev.clientY; // vers le haut = augmente
      const sensitivity = ev.shiftKey ? 0.002 : 0.01; // Shift = précision
      const delta = dy * sensitivity * (max - min);
      const newVal = Math.min(max, Math.max(min, dragRef.current.startValue + delta));
      onChange(newVal);
    };

    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [value, min, max, onChange]);

  const onDoubleClick = useCallback(() => {
    if (defaultValue !== undefined) onChange(defaultValue);
  }, [defaultValue, onChange]);

  // ── Wheel ──────────────────────────────────────────────────────────────────
  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const step = (max - min) * (e.shiftKey ? 0.001 : 0.01);
    const newVal = Math.min(max, Math.max(min, value + (e.deltaY < 0 ? step : -step)));
    onChange(newVal);
  }, [value, min, max, onChange]);

  // Empêche la propagation de scroll quand le curseur est sur le knob
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => e.preventDefault();
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  // Formatage de la valeur affichée
  const displayValue = value.toFixed(decimals);

  return (
    <div className={styles.knobContainer} ref={containerRef}>
      <svg
        className={styles.knobSvg}
        width={size}
        height={size}
        onMouseDown={onMouseDown}
        onDoubleClick={onDoubleClick}
        onWheel={onWheel}
        style={{ cursor: 'ns-resize' }}
        aria-label={`${label}: ${displayValue}${unit}`}
        role="slider"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
      >
        {/* Piste de fond */}
        <path
          d={arcPath(angleMin, angleMax)}
          fill="none"
          stroke="var(--color-border)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        {/* Arc de valeur */}
        <path
          d={arcPath(angleMin, angle)}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        {/* Cercle principal */}
        <circle
          cx={cx}
          cy={cy}
          r={r - strokeWidth}
          fill="var(--color-surface)"
          stroke="var(--color-border)"
          strokeWidth={1}
        />
        {/* Indicateur (point) */}
        <circle
          cx={indicator.x}
          cy={indicator.y}
          r={strokeWidth * 0.6}
          fill="var(--color-accent)"
        />
      </svg>

      <div className={styles.knobValue} title={`${displayValue}${unit}`}>
        {displayValue}{unit}
      </div>
      <div className={styles.knobLabel}>{label}</div>
    </div>
  );
}
