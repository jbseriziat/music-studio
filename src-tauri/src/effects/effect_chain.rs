use super::Effect;

/// Un slot d'effet dans la chaîne : identifiant, bypass, et l'effet lui-même.
pub struct EffectSlot {
    pub id: u32,
    pub bypass: bool,
    pub effect: Box<dyn Effect + Send>,
}

/// Chaîne d'effets sérialisée pour une piste.
/// Traitée frame par frame dans le callback audio (pas d'allocation).
pub struct EffectChain {
    pub slots: Vec<EffectSlot>,
    next_id: u32,
}

impl EffectChain {
    pub fn new() -> Self {
        Self {
            slots: Vec::new(),
            next_id: 1,
        }
    }

    /// Traite une frame stéréo à travers tous les effets en série.
    #[inline]
    pub fn process(&mut self, input_l: f32, input_r: f32) -> (f32, f32) {
        if self.slots.is_empty() {
            return (input_l, input_r);
        }
        let mut l = input_l;
        let mut r = input_r;
        for slot in &mut self.slots {
            if !slot.bypass {
                let (nl, nr) = slot.effect.process(l, r);
                l = nl;
                r = nr;
            }
        }
        (l, r)
    }

    /// Ajoute un effet avec l'ID spécifié (généré par le thread principal).
    pub fn add_with_id(&mut self, id: u32, effect: Box<dyn Effect + Send>) {
        self.slots.push(EffectSlot { id, bypass: false, effect });
        if id >= self.next_id {
            self.next_id = id + 1;
        }
    }

    /// Supprime un slot par son ID. Retourne `true` si trouvé.
    pub fn remove(&mut self, id: u32) -> bool {
        let before = self.slots.len();
        self.slots.retain(|s| s.id != id);
        self.slots.len() < before
    }

    /// Active/désactive le bypass d'un slot. Retourne `true` si trouvé.
    pub fn set_bypass(&mut self, id: u32, bypass: bool) -> bool {
        if let Some(slot) = self.slots.iter_mut().find(|s| s.id == id) {
            slot.bypass = bypass;
            true
        } else {
            false
        }
    }

    /// Définit un paramètre d'un slot. Retourne `true` si trouvé.
    pub fn set_param(&mut self, id: u32, param: &str, value: f32) -> bool {
        if let Some(slot) = self.slots.iter_mut().find(|s| s.id == id) {
            slot.effect.set_param(param, value);
            true
        } else {
            false
        }
    }

    /// Retourne tous les paramètres d'un slot si trouvé.
    pub fn get_all_params(&self, id: u32) -> Option<Vec<(String, f32)>> {
        self.slots.iter().find(|s| s.id == id).map(|s| s.effect.get_all_params())
    }

    /// Indique si la chaîne est vide (pas d'effets à traiter).
    pub fn is_empty(&self) -> bool {
        self.slots.is_empty()
    }

    /// Injecte les niveaux pré-effet de toutes les pistes dans les compresseurs
    /// qui ont un sidechain actif. Phase 5.5.
    pub fn inject_sidechain_levels(&mut self, pre_fx_peaks: &[f32; 64]) {
        for slot in &mut self.slots {
            if slot.effect.effect_type() == "compressor" {
                let sc_source = slot.effect.get_param("sidechain");
                if sc_source >= 0.0 {
                    let src_tidx = (sc_source as u32 % 64) as usize;
                    slot.effect.set_param("_sidechain_level", pre_fx_peaks[src_tidx]);
                }
            }
        }
    }
}

impl Default for EffectChain {
    fn default() -> Self {
        Self::new()
    }
}
