/// Configuration du moteur audio.
/// Format interne : f32, 48000 Hz, stéréo (2 canaux entrelacés), buffer 512 frames.
#[derive(Debug, Clone)]
pub struct AudioConfig {
    pub sample_rate: u32,
    pub buffer_size: u32,
    pub channels: u16,
    pub bit_depth: u16,
}

impl Default for AudioConfig {
    fn default() -> Self {
        Self {
            sample_rate: 48000,
            buffer_size: 512,
            channels: 2,
            bit_depth: 32,
        }
    }
}
