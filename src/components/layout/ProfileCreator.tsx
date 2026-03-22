import { useState } from 'react';
import { useSettingsStore } from '../../stores/settingsStore';
import { LEVEL_CONFIGS } from '../../types/levels';
import type { FeatureLevel } from '../../types/levels';
import styles from './ProfileCreator.module.css';

const AVATARS = ['🎵', '🎸', '🥁', '🎹', '🎤', '🦊', '🐱', '🐻', '🦁', '🐸',
                 '⭐', '🌈', '🚀', '🎈', '🌟', '🎀', '🎯', '🎨', '🎃', '🦄'];

// Questions math simples pour la protection des niveaux 4-5
const MATH_QUESTIONS = [
  { q: 'Combien font 3 + 4 ?', a: '7' },
  { q: 'Combien font 2 + 5 ?', a: '7' },
  { q: 'Combien font 4 + 4 ?', a: '8' },
  { q: 'Combien font 6 + 3 ?', a: '9' },
  { q: 'Combien font 5 + 5 ?', a: '10' },
];

interface Props {
  onClose: () => void;
}

export function ProfileCreator({ onClose }: Props) {
  const { createProfile, switchProfile } = useSettingsStore();
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState('🎵');
  const [level, setLevel] = useState<FeatureLevel>(1);
  const [mathAnswer, setMathAnswer] = useState('');
  const [mathQ] = useState(() => MATH_QUESTIONS[Math.floor(Math.random() * MATH_QUESTIONS.length)]);
  const [error, setError] = useState('');

  const requiresMath = level >= 4;

  const handleSubmit = () => {
    if (!name.trim()) {
      setError('Choisis un prénom !');
      return;
    }
    if (requiresMath && mathAnswer.trim() !== mathQ.a) {
      setError('Mauvaise réponse. Essaie encore !');
      return;
    }
    createProfile({ name: name.trim(), avatar, level, theme: level <= 2 ? 'colorful' : 'dark' });
    // Activer automatiquement le nouveau profil
    const ps = useSettingsStore.getState().profiles;
    const newId = ps[ps.length - 1]?.id;
    if (newId) switchProfile(newId);
    onClose();
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <h2 className={styles.title}>Nouveau profil</h2>

        {/* Nom */}
        <div className={styles.field}>
          <label className={styles.label}>Ton prénom</label>
          <input
            className={styles.input}
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Ex: Emma, Lucas…"
            maxLength={20}
            autoFocus
          />
        </div>

        {/* Avatars */}
        <div className={styles.field}>
          <label className={styles.label}>Ton avatar</label>
          <div className={styles.avatarGrid}>
            {AVATARS.map(av => (
              <button
                key={av}
                className={`${styles.avatarBtn} ${avatar === av ? styles.avatarSelected : ''}`}
                onClick={() => setAvatar(av)}
              >
                {av}
              </button>
            ))}
          </div>
        </div>

        {/* Niveau */}
        <div className={styles.field}>
          <label className={styles.label}>Niveau</label>
          <div className={styles.levelList}>
            {LEVEL_CONFIGS.map(cfg => (
              <button
                key={cfg.level}
                className={`${styles.levelBtn} ${level === cfg.level ? styles.levelSelected : ''}`}
                onClick={() => setLevel(cfg.level)}
              >
                <span>{cfg.icon}</span>
                <div>
                  <div className={styles.levelName}>{cfg.label}</div>
                  <div className={styles.levelDesc}>{cfg.description}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Protection niveaux 4-5 */}
        {requiresMath && (
          <div className={styles.field}>
            <label className={styles.label}>Question parentale : {mathQ.q}</label>
            <input
              className={styles.input}
              value={mathAnswer}
              onChange={e => setMathAnswer(e.target.value)}
              placeholder="Ta réponse"
              type="number"
            />
          </div>
        )}

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.actions}>
          <button className={styles.cancelBtn} onClick={onClose}>Annuler</button>
          <button className={styles.submitBtn} onClick={handleSubmit}>Créer le profil ✓</button>
        </div>
      </div>
    </div>
  );
}
