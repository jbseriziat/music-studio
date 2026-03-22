import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { UserProfile } from '../types/profile';
import type { FeatureLevel } from '../types/levels';

interface SettingsState {
  profiles: UserProfile[];
  activeProfileId: string | null;
  // Valeurs dérivées gardées en sync pour faciliter les sélecteurs
  currentLevel: FeatureLevel;
  currentTheme: 'light' | 'dark' | 'colorful';
  // Actions
  createProfile: (profile: Omit<UserProfile, 'id' | 'createdAt'>) => void;
  switchProfile: (id: string) => void;
  updateProfile: (id: string, updates: Partial<UserProfile>) => void;
  deleteProfile: (id: string) => void;
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
    }),
    { name: 'music-studio-settings' }
  )
);
