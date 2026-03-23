import { useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Dialog from '@radix-ui/react-dialog';
import { useSettingsStore } from '../../stores/settingsStore';
import { LEVEL_CONFIGS } from '../../types/levels';
import { ProfileSelector } from './ProfileSelector';
import type { UserProfile } from '../../types/profile';
import styles from './ProfileSwitcher.module.css';

export function ProfileSwitcher() {
  const { profiles, activeProfileId, switchProfile } = useSettingsStore();
  const activeProfile = profiles.find(p => p.id === activeProfileId);
  const levelConfig   = LEVEL_CONFIGS.find(c => c.level === activeProfile?.level);

  const [showManager,    setShowManager]    = useState(false);
  const [pendingProfile, setPendingProfile] = useState<UserProfile | null>(null);
  const [codeInput,      setCodeInput]      = useState('');
  const [codeError,      setCodeError]      = useState('');

  // Sélection d'un profil (avec vérif code parent si niveau 4-5)
  const handleSelectProfile = (profile: UserProfile) => {
    if (profile.id === activeProfileId) return;
    if (profile.parentCode) {
      setPendingProfile(profile);
      setCodeInput('');
      setCodeError('');
    } else {
      switchProfile(profile.id);
    }
  };

  const handleCodeConfirm = () => {
    if (!pendingProfile) return;
    if (codeInput.trim() === pendingProfile.parentCode) {
      switchProfile(pendingProfile.id);
      setPendingProfile(null);
    } else {
      setCodeError('Code incorrect. Réessaie !');
    }
  };

  return (
    <>
      {/* ── Dropdown principal ── */}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button className={styles.trigger} aria-label="Changer de profil">
            <span className={styles.avatar}>{activeProfile?.avatar ?? '👤'}</span>
            <div className={styles.info}>
              <span className={styles.name}>{activeProfile?.name ?? 'Profil'}</span>
              <span className={styles.level} style={{ color: levelConfig?.color }}>
                {levelConfig?.icon} {levelConfig?.label}
              </span>
            </div>
            <span className={styles.chevron}>▾</span>
          </button>
        </DropdownMenu.Trigger>

        <DropdownMenu.Portal>
          <DropdownMenu.Content className={styles.menu} sideOffset={6} align="end">
            <DropdownMenu.Label className={styles.menuLabel}>Choisir un profil</DropdownMenu.Label>

            {profiles.map(profile => {
              const cfg = LEVEL_CONFIGS.find(c => c.level === profile.level);
              const isActive = profile.id === activeProfileId;
              return (
                <DropdownMenu.Item
                  key={profile.id}
                  className={`${styles.menuItem} ${isActive ? styles.menuItemActive : ''}`}
                  onSelect={() => handleSelectProfile(profile)}
                >
                  <span className={styles.menuAvatar}>{profile.avatar}</span>
                  <div className={styles.menuItemText}>
                    <span className={styles.menuName}>{profile.name}</span>
                    <span className={styles.menuLevel} style={{ color: cfg?.color }}>
                      {cfg?.icon} {cfg?.label}
                      {profile.parentCode && ' 🔒'}
                    </span>
                  </div>
                  {isActive && <span className={styles.activeCheck}>✓</span>}
                </DropdownMenu.Item>
              );
            })}

            <DropdownMenu.Separator className={styles.separator} />

            <DropdownMenu.Item
              className={`${styles.menuItem} ${styles.menuItemManage}`}
              onSelect={() => setShowManager(true)}
            >
              👥 Gérer les profils
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      {/* ── Dialog code parent ── */}
      <Dialog.Root
        open={!!pendingProfile}
        onOpenChange={open => { if (!open) setPendingProfile(null); }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className={styles.dialogOverlay} />
          <Dialog.Content className={styles.dialogContent} aria-describedby={undefined}>
            <Dialog.Title className={styles.dialogTitle}>
              🔒 Profil protégé
            </Dialog.Title>
            <p className={styles.dialogDesc}>
              Le profil <strong>{pendingProfile?.avatar} {pendingProfile?.name}</strong> est protégé.
              Entre le code parent pour continuer.
            </p>
            <input
              className={styles.codeInput}
              type="password"
              value={codeInput}
              onChange={e => { setCodeInput(e.target.value); setCodeError(''); }}
              onKeyDown={e => e.key === 'Enter' && handleCodeConfirm()}
              placeholder="Code parent…"
              autoFocus
            />
            {codeError && <p className={styles.codeError}>{codeError}</p>}
            <div className={styles.dialogActions}>
              <button
                className={styles.dialogCancelBtn}
                onClick={() => setPendingProfile(null)}
              >
                Annuler
              </button>
              <button className={styles.dialogConfirmBtn} onClick={handleCodeConfirm}>
                Confirmer
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* ── Écran de gestion des profils ── */}
      {showManager && (
        <ProfileSelector fullscreen={false} onClose={() => setShowManager(false)} />
      )}
    </>
  );
}
