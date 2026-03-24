pub mod compressor;
pub mod delay;
pub mod effect_chain;
pub mod eq;
pub mod reverb;

pub use effect_chain::EffectChain;

/// Trait commun à tous les effets audio.
/// Les implémentations doivent être `Send` pour traverser les threads.
pub trait Effect: Send {
    /// Traite une frame stéréo et retourne la sortie traitée.
    fn process(&mut self, input_l: f32, input_r: f32) -> (f32, f32);

    /// Définit la valeur d'un paramètre par son nom.
    fn set_param(&mut self, name: &str, value: f32);

    /// Retourne la valeur d'un paramètre par son nom (0.0 si inconnu).
    fn get_param(&self, name: &str) -> f32;

    /// Retourne tous les paramètres (nom, valeur).
    fn get_all_params(&self) -> Vec<(String, f32)>;

    /// Remet à zéro l'état interne (buffers, filtres, etc.).
    fn reset(&mut self);

    /// Nom lisible de l'effet (ex: "Reverb").
    fn name(&self) -> &str;

    /// Identifiant de type (ex: "reverb", "delay").
    fn effect_type(&self) -> &str;
}

/// Wrapper `Box<dyn Effect>` avec impl `Debug` pour être dans `AudioCommand`.
pub struct BoxedEffect(pub Box<dyn Effect + Send>);

impl std::fmt::Debug for BoxedEffect {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "Effect({})", self.0.effect_type())
    }
}
