import styles from './StepCursor.module.css';

/**
 * Curseur de lecture du step sequencer.
 *
 * Colonne semi-transparente positionnée absolument au-dessus de la grille,
 * qui indique visuellement le step en cours de lecture.
 *
 * Positionnement :
 *   left = PAD_W + ROW_GAP + step * (CELL_W + CELL_GAP) + downbeats * DOWNBEAT_MARGIN
 *        = 140 + step * 25 + floor(step / 4) * 4
 *
 * Constants (doivent rester synchronisées avec StepRow.module.css) :
 *   PAD_W           = 130px (largeur du DrumPad)
 *   ROW_GAP         = 6px  (gap entre pad et cellules dans .row)
 *   CELL_W          = 22px
 *   CELL_GAP        = 3px  (gap entre cellules dans .cells)
 *   DOWNBEAT_MARGIN = 4px  (margin-left sur .downbeat, i.e. steps 0,4,8,12...)
 *
 * Le step 0 est lui-même un downbeat, d'où le `+ 1` implicite dans la formule :
 *   left(0)  = 140 + 0   * 25 + 0 * 4 = 140
 *   left(4)  = 140 + 4   * 25 + 1 * 4 = 244
 *   left(8)  = 140 + 8   * 25 + 2 * 4 = 348
 *   left(12) = 140 + 12  * 25 + 3 * 4 = 452
 */

interface Props {
  /** Index du step en cours (0-based). */
  stepIndex: number;
  /** Si false, le curseur est masqué. */
  visible: boolean;
}

export function StepCursor({ stepIndex, visible }: Props) {
  if (!visible) return null;

  // PAD_W(130) + ROW_GAP(6) + first downbeat margin(4) = 140
  const left = 140 + stepIndex * 25 + Math.floor(stepIndex / 4) * 4;

  return (
    <div
      className={styles.cursor}
      style={{ left }}
      aria-hidden="true"
    />
  );
}
