import { useState, useCallback, useEffect, useRef } from 'react';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { useProjectStore } from '../../stores/projectStore';
import { exportProjectCmd, getExportPath, type ExportOptions } from '../../utils/tauri-commands';
import styles from './ExportDialog.module.css';

interface Props {
  onClose: () => void;
}

interface ExportProgressPayload {
  percent: number;
}

export function ExportDialog({ onClose }: Props) {
  const { projectName, buildProject } = useProjectStore();

  const [bitDepth, setBitDepth] = useState<16 | 32>(16);
  const [sampleRate, setSampleRate] = useState<44100 | 48000>(48000);
  const [normalize, setNormalize] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [exportPath, setExportPath] = useState<string>('');

  const unlistenRef = useRef<UnlistenFn | null>(null);

  // Charger le chemin d'export par défaut.
  useEffect(() => {
    if (projectName) {
      getExportPath(projectName)
        .then(setExportPath)
        .catch(() => setExportPath('~/MusicStudio/Exports/projet.wav'));
    }
  }, [projectName]);

  // Nettoyage du listener au démontage.
  useEffect(() => {
    return () => {
      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
      }
    };
  }, []);

  const handleExport = useCallback(async () => {
    if (!projectName) return;

    setIsExporting(true);
    setProgress(0);
    setError(null);
    setDone(false);

    try {
      // Écouter les événements de progression.
      unlistenRef.current = await listen<ExportProgressPayload>(
        'export://progress',
        (event) => setProgress(Math.round(event.payload.percent * 100)),
      );

      const path = await getExportPath(projectName);
      setExportPath(path);

      const project = buildProject();
      const options: ExportOptions = {
        format: 'wav',
        normalize,
        sample_rate: sampleRate,
        bit_depth: bitDepth,
      };

      await exportProjectCmd(project, path, options);
      setProgress(100);
      setDone(true);
    } catch (e) {
      setError(String(e));
    } finally {
      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
      }
      setIsExporting(false);
    }
  }, [projectName, buildProject, bitDepth, sampleRate, normalize]);

  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !isExporting) onClose();
  }, [isExporting, onClose]);

  return (
    <div className={styles.overlay} onClick={handleOverlayClick}>
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-label="Exporter le projet">
        {/* ── En-tête ─────────────────────────────────────────────────── */}
        <div className={styles.header}>
          <h2 className={styles.title}>🎧 Exporter le projet</h2>
          <button
            className={styles.closeBtn}
            onClick={onClose}
            disabled={isExporting}
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>

        {/* ── Corps ───────────────────────────────────────────────────── */}
        <div className={styles.body}>
          {/* Fichier de destination */}
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Destination</span>
            <span className={styles.fieldValue} title={exportPath}>
              {exportPath || '…'}
            </span>
          </div>

          {/* Format — WAV uniquement */}
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Format</span>
            <span className={styles.fieldValue}>WAV (sans perte)</span>
          </div>

          {/* Profondeur de bits */}
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Profondeur</span>
            <div className={styles.radioGroup}>
              <label className={`${styles.radioLabel} ${bitDepth === 16 ? styles.selected : ''}`}>
                <input
                  type="radio"
                  name="bitDepth"
                  value="16"
                  checked={bitDepth === 16}
                  onChange={() => setBitDepth(16)}
                  disabled={isExporting}
                />
                16 bits <span className={styles.hint}>CD</span>
              </label>
              <label className={`${styles.radioLabel} ${bitDepth === 32 ? styles.selected : ''}`}>
                <input
                  type="radio"
                  name="bitDepth"
                  value="32"
                  checked={bitDepth === 32}
                  onChange={() => setBitDepth(32)}
                  disabled={isExporting}
                />
                32 bits float <span className={styles.hint}>Pro</span>
              </label>
            </div>
          </div>

          {/* Fréquence d'échantillonnage */}
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Fréquence</span>
            <div className={styles.radioGroup}>
              <label className={`${styles.radioLabel} ${sampleRate === 44100 ? styles.selected : ''}`}>
                <input
                  type="radio"
                  name="sampleRate"
                  value="44100"
                  checked={sampleRate === 44100}
                  onChange={() => setSampleRate(44100)}
                  disabled={isExporting}
                />
                44 100 Hz
              </label>
              <label className={`${styles.radioLabel} ${sampleRate === 48000 ? styles.selected : ''}`}>
                <input
                  type="radio"
                  name="sampleRate"
                  value="48000"
                  checked={sampleRate === 48000}
                  onChange={() => setSampleRate(48000)}
                  disabled={isExporting}
                />
                48 000 Hz
              </label>
            </div>
          </div>

          {/* Normalisation */}
          <div className={styles.field}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={normalize}
                onChange={(e) => setNormalize(e.target.checked)}
                disabled={isExporting}
              />
              <span>Normaliser le volume (0 dBFS)</span>
            </label>
          </div>

          {/* Section progression */}
          {(isExporting || done || error) && (
            <div className={styles.progressSection}>
              {error ? (
                <p className={styles.errorMsg}>❌ {error}</p>
              ) : done ? (
                <p className={styles.doneMsg}>
                  ✅ Export réussi !
                  <span className={styles.doneHint}>{exportPath}</span>
                </p>
              ) : (
                <>
                  <div className={styles.progressBar}>
                    <div
                      className={styles.progressFill}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <span className={styles.progressText}>{progress}%</span>
                </>
              )}
            </div>
          )}
        </div>

        {/* ── Pied de page ────────────────────────────────────────────── */}
        <div className={styles.footer}>
          <button
            className={styles.cancelBtn}
            onClick={onClose}
            disabled={isExporting}
          >
            {done ? 'Fermer' : 'Annuler'}
          </button>
          <button
            className={styles.exportBtn}
            onClick={handleExport}
            disabled={isExporting || done || !projectName}
          >
            {isExporting ? '⏳ Export en cours…' : '💾 Exporter en WAV'}
          </button>
        </div>
      </div>
    </div>
  );
}
