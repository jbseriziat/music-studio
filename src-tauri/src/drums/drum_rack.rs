use serde::{Deserialize, Serialize};

/// Configuration d'un pad du drum rack (volume, pitch, sample assigné).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DrumPadConfig {
    pub sample_id: u32,
    /// Volume du pad : 0.0 = silence, 1.0 = nominal, 2.0 = +6 dB.
    pub volume: f32,
    /// Transposition en demi-tons : −12 à +12.
    pub pitch_semitones: f32,
    pub name: String,
}

/// Informations affichées dans le sélecteur de kit.
#[derive(Debug, Clone, Serialize)]
pub struct DrumKitInfo {
    /// Identifiant interne utilisé dans `kit_pads()`.
    pub name: String,
    /// Nom affiché (avec emoji).
    pub display_name: String,
}

/// Retourne la liste des kits intégrés.
pub fn built_in_kits() -> Vec<DrumKitInfo> {
    vec![
        DrumKitInfo { name: "default".into(),    display_name: "🥁 Default".into()    },
        DrumKitInfo { name: "hiphop".into(),     display_name: "🎤 Hip-Hop".into()    },
        DrumKitInfo { name: "rock".into(),       display_name: "🎸 Rock".into()       },
        DrumKitInfo { name: "electronic".into(), display_name: "⚡ Electronic".into() },
        DrumKitInfo { name: "kids".into(),       display_name: "🎠 Fun Kids".into()   },
    ]
}

/// Retourne les 8 configurations de pads pour un kit donné.
///
/// Mapping des sample IDs générés par `sample_bank.rs` :
/// 0=kick, 1=kick2, 2=snare, 3=snare2, 4=hihat_closed, 5=hihat_open,
/// 6=clap, 7=tom_high, 8=tom_low, 9=tom_mid (si disponible)
pub fn kit_pads(name: &str) -> Vec<DrumPadConfig> {
    match name {
        "hiphop" => vec![
            DrumPadConfig { sample_id: 0, volume: 1.0, pitch_semitones: -2.0, name: "Kick".into()    },
            DrumPadConfig { sample_id: 2, volume: 0.9, pitch_semitones:  0.0, name: "Snare".into()   },
            DrumPadConfig { sample_id: 4, volume: 0.7, pitch_semitones:  0.0, name: "Hi-hat".into()  },
            DrumPadConfig { sample_id: 5, volume: 0.6, pitch_semitones:  0.0, name: "HH Open".into() },
            DrumPadConfig { sample_id: 6, volume: 1.0, pitch_semitones:  0.0, name: "Clap".into()    },
            DrumPadConfig { sample_id: 7, volume: 0.8, pitch_semitones: -3.0, name: "Tom H".into()   },
            DrumPadConfig { sample_id: 8, volume: 0.8, pitch_semitones: -5.0, name: "Tom B".into()   },
            DrumPadConfig { sample_id: 3, volume: 0.9, pitch_semitones:  2.0, name: "Snap".into()    },
        ],
        "rock" => vec![
            DrumPadConfig { sample_id: 0, volume: 1.0, pitch_semitones:  0.0, name: "Kick".into()    },
            DrumPadConfig { sample_id: 2, volume: 1.0, pitch_semitones:  0.0, name: "Snare".into()   },
            DrumPadConfig { sample_id: 4, volume: 0.8, pitch_semitones:  0.0, name: "Hi-hat".into()  },
            DrumPadConfig { sample_id: 5, volume: 0.9, pitch_semitones:  0.0, name: "HH Open".into() },
            DrumPadConfig { sample_id: 6, volume: 1.0, pitch_semitones:  0.0, name: "Clap".into()    },
            DrumPadConfig { sample_id: 7, volume: 0.9, pitch_semitones:  2.0, name: "Tom H".into()   },
            DrumPadConfig { sample_id: 8, volume: 0.9, pitch_semitones: -2.0, name: "Tom L".into()   },
            DrumPadConfig { sample_id: 3, volume: 0.9, pitch_semitones:  0.0, name: "Snare 2".into() },
        ],
        "electronic" => vec![
            DrumPadConfig { sample_id: 1, volume: 1.0, pitch_semitones: -4.0, name: "Sub Kick".into() },
            DrumPadConfig { sample_id: 3, volume: 1.0, pitch_semitones:  4.0, name: "Clap".into()     },
            DrumPadConfig { sample_id: 4, volume: 0.6, pitch_semitones:  3.0, name: "Hi-hat".into()   },
            DrumPadConfig { sample_id: 5, volume: 0.5, pitch_semitones:  6.0, name: "Open HH".into()  },
            DrumPadConfig { sample_id: 6, volume: 1.0, pitch_semitones:  2.0, name: "Clap 2".into()   },
            DrumPadConfig { sample_id: 7, volume: 0.7, pitch_semitones: -6.0, name: "Tom".into()      },
            DrumPadConfig { sample_id: 2, volume: 0.9, pitch_semitones:  6.0, name: "Snare".into()    },
            DrumPadConfig { sample_id: 0, volume: 0.8, pitch_semitones:  4.0, name: "Punch".into()    },
        ],
        "kids" => vec![
            DrumPadConfig { sample_id: 0, volume: 1.0, pitch_semitones:  5.0, name: "Boom".into()   },
            DrumPadConfig { sample_id: 6, volume: 1.0, pitch_semitones:  0.0, name: "Clap".into()   },
            DrumPadConfig { sample_id: 4, volume: 0.7, pitch_semitones:  7.0, name: "Tick".into()   },
            DrumPadConfig { sample_id: 5, volume: 0.6, pitch_semitones:  5.0, name: "Tock".into()   },
            DrumPadConfig { sample_id: 3, volume: 1.0, pitch_semitones:  3.0, name: "Pop".into()    },
            DrumPadConfig { sample_id: 7, volume: 0.8, pitch_semitones:  7.0, name: "Boing".into()  },
            DrumPadConfig { sample_id: 8, volume: 0.8, pitch_semitones: -7.0, name: "Thud".into()   },
            DrumPadConfig { sample_id: 2, volume: 0.9, pitch_semitones:  5.0, name: "Snap".into()   },
        ],
        // "default" et cas inconnu
        _ => vec![
            DrumPadConfig { sample_id: 0, volume: 1.0, pitch_semitones: 0.0, name: "Kick".into()    },
            DrumPadConfig { sample_id: 2, volume: 1.0, pitch_semitones: 0.0, name: "Snare".into()   },
            DrumPadConfig { sample_id: 4, volume: 1.0, pitch_semitones: 0.0, name: "Hi-hat".into()  },
            DrumPadConfig { sample_id: 5, volume: 1.0, pitch_semitones: 0.0, name: "HH Open".into() },
            DrumPadConfig { sample_id: 6, volume: 1.0, pitch_semitones: 0.0, name: "Clap".into()    },
            DrumPadConfig { sample_id: 7, volume: 1.0, pitch_semitones: 0.0, name: "Tom H".into()   },
            DrumPadConfig { sample_id: 8, volume: 1.0, pitch_semitones: 0.0, name: "Tom B".into()   },
            DrumPadConfig { sample_id: 3, volume: 1.0, pitch_semitones: 0.0, name: "Snare 2".into() },
        ],
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_built_in_kits_count() {
        assert_eq!(built_in_kits().len(), 5);
    }

    #[test]
    fn test_kit_pads_length() {
        for kit in built_in_kits() {
            let pads = kit_pads(&kit.name);
            assert_eq!(pads.len(), 8, "Kit '{}' doit avoir 8 pads", kit.name);
        }
    }

    #[test]
    fn test_default_kit_volumes() {
        let pads = kit_pads("default");
        for p in &pads {
            assert!(p.volume > 0.0 && p.volume <= 2.0, "Volume hors plage");
            assert!(p.pitch_semitones >= -12.0 && p.pitch_semitones <= 12.0, "Pitch hors plage");
        }
    }

    #[test]
    fn test_unknown_kit_falls_back_to_default() {
        let pads = kit_pads("unknown_kit_xyz");
        assert_eq!(pads.len(), 8);
        assert_eq!(pads[0].name, "Kick");
    }
}
