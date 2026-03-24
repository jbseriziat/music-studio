import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { UserProfile } from '../types/profile';
import type { FeatureLevel } from '../types/levels';

/** Taille de buffer autorisée (frames). */
export type BufferSize = 128 | 256 | 512 | 1024;
/** Sample rate autorisé (Hz). */
export type SampleRate = 44100 | 48000;

interface SettingsState {
  profiles: UserProfile[];
  activeProfileId: string | null;
  // Valeurs dérivées gardées en sync pour faciliter les sélecteurs
  currentLevel: FeatureLevel;
  currentTheme: 'light' | 'dark' | 'colorful';

  // ── Préférences audio ─────────────────────────────────────────────────────
  /** Nom du périphérique de sortie audio (null = périphérique par défaut). */
  audioOutputDevice: string | null;
  /** Nom du périphérique d'entrée audio (null = périphérique par défaut). */
  audioInputDevice: string | null;
  /** Taille du buffer audio (frames). Modifiable — nécessite un redémarrage. */
  audioBufferSize: BufferSize;
  /** Fréquence d'échantillonnage (Hz). Modifiable — nécessite un redémarrage. */
  audioSampleRate: SampleRate;

  // Actions
  createProfile: (profile: Omit<UserProfile, 'id' | 'createdAt'>) => void;
  switchProfile: (id: string) => void;
  updateProfile: (id: string, updates: Partial<UserProfile>) => void;
  deleteProfile: (id: string) => void;
  /** Met à jour les préférences audio (persistées dans localStorage). */
  setAudioPreferences: (prefs: {
    outputDevice?: string | null;
    inputDevice?: string | null;
    bufferSize?: BufferSize;
    sampleRate?: SampleRate;
  }) => void;
}

const defaultProfile: UserProfile = {
  id: 'default',
  name: 'Joueur',
  avatar: '🎵',
  level: 1,
  theme: 'colorful',
  createdAt: new Date().toISOString(),
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      profiles: [defaultProfile],
      activeProfileId: defaultProfile.id,
      currentLevel: defaultProfile.level,
      currentTheme: defaultProfile.theme,

      // Valeurs par défaut pour les préférences audio.
      audioOutputDevice: null,
      audioInputDevice: null,
      audioBufferSize: 512 as BufferSize,
      audioSampleRate: 48000 as SampleRate,

      createProfile: (profile) => {
        const newProfile: UserProfile = {
          ...profile,
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
        };
        set((state) => ({ profiles: [...state.profiles, newProfile] }));
      },

      switchProfile: (id) => {
        const profile = get().profiles.find((p) => p.id === id);
        if (!profile) return;
        set({
          activeProfileId: id,
          currentLevel: profile.level,
          currentTheme: profile.theme,
        });
      },

      updateProfile: (id, updates) => {
        set((state) => {
          const profiles = state.profiles.map((p) =>
            p.id === id ? { ...p, ...updates } : p
          );
          const active = profiles.find((p) => p.id === state.activeProfileId);
          return {
            profiles,
            currentLevel: active?.level ?? state.currentLevel,
            currentTheme: active?.theme ?? state.currentTheme,
          };
        });
      },

      deleteProfile: (id) => {
        set((state) => {
          const profiles = state.profiles.filter((p) => p.id !== id);
          if (state.activeProfileId !== id) return { profiles };
          // Si on supprime le profil actif, basculer sur le premier restant
          const next = profiles[0];
          if (!next) return { profiles, activeProfileId: null };
          return {
            profiles,
            activeProfileId: next.id,
            currentLevel: next.level,
            currentTheme: next.theme,
          };
        });
      },

      setAudioPreferences: ({ outputDevice, inputDevice, bufferSize, sampleRate }) => {
        set((s) => ({
          audioOutputDevice: outputDevice !== undefined ? outputDevice : s.audioOutputDevice,
          audioInputDevice: inputDevice !== undefined ? inputDevice : s.audioInputDevice,
          audioBufferSize: bufferSize ?? s.audioBufferSize,
          audioSampleRate: sampleRate ?? s.audioSampleRate,
        }));
      },
    }),
    { name: 'music-studio-settings' }
  )
);
