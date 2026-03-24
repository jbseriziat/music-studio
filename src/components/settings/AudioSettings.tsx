import { useEffect, useState } from 'react';
import { useSettingsStore } from '../../stores/settingsStore';
import type { BufferSize, SampleRate } from '../../stores/settingsStore';
import { getAudioDevices } from '../../utils/tauri-commands';
import type { AudioDevice } from '../../utils/tauri-commands';
import styles from './AudioSettings.module.css';

/** Calcule la latence approximative en millisecondes. */
function latencyMs(bufferSize: number, sampleRate: number): string {
  return ((bufferSize / sampleRate) * 1000).toFixed(1);
}

const BUFFER_SIZES: BufferSize[] = [128, 256, 512, 1024];
const SAMPLE_RATES: SampleRate[] = [44100, 48000];

/**
 * Panneau de configuration audio : périphérique de sortie/entrée,
 * taille du buffer et fréquence d'échantillonnage.
 * Les modifications sont persistées dans settingsStore (localStorage)
 * et prendront effet au prochain démarrage de l'application.
 */
export function AudioSettings() {
  const {
    audioOutputDevice, audioInputDevice, audioBufferSize, audioSampleRate,
    setAudioPreferences,
  } = useSettingsStore();

  const [outputDevices, setOutputDevices] = useState<AudioDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasChanged, setHasChanged] = useState(false);

  // Charger la liste des périphériques disponibles.
  useEffect(() => {
    getAudioDevices()
      .then(setOutputDevices)
      .catch(() => setOutputDevices([]))
      .finally(() => setLoading(false));
  }, []);

  function handleOutputDevice(name: string) {
    setAudioPreferences({ outputDevice: name === '' ? null : name });
    setHasChanged(true);
  }

  function handleBufferSize(size: number) {
    setAudioPreferences({ bufferSize: size as BufferSize });
    setHasChanged(true);
  }

  function handleSampleRate(rate: number) {
    setAudioPreferences({ sampleRate: rate as SampleRate });
    setHasChanged(true);
  }

  return (
    <div className={styles.container}>
      <h3 className={styles.sectionTitle}>⚙️ Paramètres audio</h3>

      {/* Périphérique de sortie */}
      <div className={styles.field}>
        <label className={styles.label}>Sortie audio</label>
        <select
          className={styles.select}
          value={audioOutputDevice ?? ''}
          onChange={(e) => handleOutputDevice(e.target.value)}
          disabled={loading}
        >
          <option value="">Par défaut</option>
          {outputDevices.map((d) => (
            <option key={d.name} value={d.name}>
              {d.name}
            </option>
          ))}
        </select>
        {loading && <span className={styles.hint}>Chargement…</span>}
      </div>

      {/* Périphérique d'entrée (affiché comme info, pas encore configurable via cpal) */}
      <div className={styles.field}>
        <label className={styles.label}>Entrée audio (micro)</label>
        <select
          className={styles.select}
          value={audioInputDevice ?? ''}
          onChange={(e) => setAudioPreferences({ inputDevice: e.target.value || null })}
        >
          <option value="">Par défaut</option>
          {outputDevices.map((d) => (
            <option key={d.name} value={d.name}>
              {d.name}
            </option>
          ))}
        </select>
      </div>

      {/* Taille du buffer */}
      <div className={styles.field}>
        <label className={styles.label}>Taille du buffer</label>
        <div className={styles.buttonGroup}>
          {BUFFER_SIZES.map((size) => (
            <button
              key={size}
              className={`${styles.optBtn} ${audioBufferSize === size ? styles.active : ''}`}
              onClick={() => handleBufferSize(size)}
            >
              <span className={styles.optValue}>{size}</span>
              <span className={styles.optLabel}>
                {latencyMs(size, audioSampleRate)} ms
              </span>
            </button>
          ))}
        </div>
        <p className={styles.hint}>
          Latence estimée : <strong>{latencyMs(audioBufferSize, audioSampleRate)} ms</strong> —
          buffer plus petit = latence plus faible mais risque de craquements
        </p>
      </div>

      {/* Sample rate */}
      <div className={styles.field}>
        <label className={styles.label}>Fréquence d'échantillonnage</label>
        <div className={styles.buttonGroup}>
          {SAMPLE_RATES.map((rate) => (
            <button
              key={rate}
              className={`${styles.optBtn} ${audioSampleRate === rate ? styles.active : ''}`}
              onClick={() => handleSampleRate(rate)}
            >
              <span className={styles.optValue}>{(rate / 1000).toFixed(1)} kHz</span>
              <span className={styles.optLabel}>{rate === 48000 ? 'Recommandé' : 'CD'}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Avertissement redémarrage */}
      {hasChanged && (
        <div className={styles.restartNote}>
          ⚠️ Les modifications prendront effet au prochain lancement de l'application.
        </div>
      )}

      {/* Infos moteur */}
      <div className={styles.engineInfo}>
        <p className={styles.infoRow}>
          <span className={styles.infoKey}>Format interne</span>
          <span className={styles.infoVal}>f32, stéréo (2 canaux entrelacés)</span>
        </p>
        <p className={styles.infoRow}>
          <span className={styles.infoKey}>Buffer courant</span>
          <span className={styles.infoVal}>
            {audioBufferSize} frames @ {audioSampleRate} Hz
            ({latencyMs(audioBufferSize, audioSampleRate)} ms)
          </span>
        </p>
      </div>
    </div>
  );
}
