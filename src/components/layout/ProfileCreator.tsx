import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useSettingsStore } from '../../stores/settingsStore';
import { LEVEL_CONFIGS } from '../../types/levels';
import type { FeatureLevel } from '../../types/levels';
import styles from './ProfileCreator.module.css';

// 16 avatars animaux/fun pour les enfants
const AVATARS = ['🦁', '🐱', '🐶', '🐸', '🦊', '🐼', '🐨', '🦄',
                  '🐙', '🦋', '🐢', '🐬', '🦜', '🐝', '🐞', '🎵'];

const THEMES = [
  { value: 'colorful' as const, label: 'Coloré', emoji: '🌈' },
  { value: 'dark'     as const, label: 'Sombre',  emoji: '🌙' },
  { value: 'light'    as const, label: 'Clair',   emoji: '☀️' },
];

interface Props {
  onClose: () => void;
}

export function ProfileCreator({ onClose }: Props) {
  const { createProfile, switchProfile } = useSettingsStore();
  const [name,        setName]        = useState('');
  const [avatar,      setAvatar]      = useState('🦁');
  const [level,       setLevel]       = useState<FeatureLevel>(1);
  const [theme,       setTheme]       = useState<'colorful' | 'dark' | 'light'>('colorful');
  const [parentCode,  setParentCode]  = useState('');
  const [error,       setError]       = useState('');

  const needsParentCode = level >= 4;

  const handleSubmit = () => {
    if (!name.trim()) {
      setError('Choisis un prénom !');
      return;
    }
    if (needsParentCode && parentCode.trim().length < 4) {
      setError('Le code parent doit faire au moins 4 caractères.');
      return;
    }
    createProfile({
      name:   name.trim(),
      avatar,
      level,
      theme,
      ...(needsParentCode ? { parentCode: parentCode.trim() } : {}),
    });
    // Activer automatiquement le nouveau profil
    const ps = useSettingsStore.getState().profiles;
    const newId = ps[ps.length - 1]?.id;
    if (newId) switchProfile(newId);
    onClose();
  };

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.modal} aria-describedby={undefined}>
          <Dialog.Title className={styles.title}>✨ Nouveau profil</Dialog.Title>

          {/* Nom */}
          <div className={styles.field}>
            <label className={styles.label}>Ton prénom</label>
            <input
              className={styles.input}
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
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
                  type="button"
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
                  type="button"
                  className={`${styles.levelBtn} ${level === cfg.level ? styles.levelSelected : ''}`}
                  style={level === cfg.level
                    ? { borderColor: cfg.color, background: `${cfg.color}22` }
                    : {}}
                  onClick={() => setLevel(cfg.level)}
                >
                  <span className={styles.levelIcon}>{cfg.icon}</span>
                  <div>
                    <div className={styles.levelName}>{cfg.label}</div>
                    <div className={styles.levelDesc}>{cfg.description}</div>
                  </div>
                  {level === cfg.level && <span className={styles.checkmark}>✓</span>}
                </button>
              ))}
            </div>
          </div>

          {/* Code parent (niveaux 4-5) */}
          {needsParentCode && (
            <div className={styles.field}>
              <label className={styles.label}>🔒 Code parent (min. 4 caractères)</label>
              <input
                className={styles.input}
                value={parentCode}
                onChange={e => setParentCode(e.target.value)}
                placeholder="Code secret pour ce profil"
                type="password"
                maxLength={32}
              />
              <p className={styles.hint}>Ce code sera demandé pour basculer vers ce profil.</p>
            </div>
          )}

          {/* Thème */}
          <div className={styles.field}>
            <label className={styles.label}>Apparence</label>
            <div className={styles.themeRow}>
              {THEMES.map(t => (
                <button
                  key={t.value}
                  type="button"
                  className={`${styles.themeBtn} ${theme === t.value ? styles.themeSelected : ''}`}
                  onClick={() => setTheme(t.value)}
                >
                  <span>{t.emoji}</span>
                  <span>{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          {error && <p className={styles.error}>⚠️ {error}</p>}

          <div className={styles.actions}>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>Annuler</button>
            <button type="button" className={styles.submitBtn} onClick={handleSubmit}>C'est parti ! 🚀</button>
          </div>

          <Dialog.Close className={styles.closeX} aria-label="Fermer">✕</Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
