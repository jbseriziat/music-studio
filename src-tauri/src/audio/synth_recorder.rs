//! Enregistrement de la sortie du synthétiseur dans un fichier WAV.
//!
//! # Principe
//!
//! Le callback audio remplit un ring buffer lock-free (`HeapProd<f32>`) avec les
//! échantillons stéréo entrelacés (L, R, L, R…) du synthé armé.
//! Ce module consomme ce ring buffer dans un thread d'écriture dédié, accumule
//! les données dans un `Vec<f32>`, puis écrit un fichier WAV 48 kHz stéréo
//! 32-bit float quand l'enregistrement est arrêté.

use hound::{SampleFormat, WavSpec, WavWriter};
use ringbuf::traits::Consumer;
use ringbuf::HeapCons;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use std::thread::{self, JoinHandle};
use std::time::Duration;

/// Gère l'enregistrement de la sortie synthé vers un fichier WAV.
///
/// Le thread d'écriture est démarré à la construction et s'arrête proprement
/// lors de l'appel à [`SynthRecorder::stop_and_save`].
pub struct SynthRecorder {
    /// Signal d'arrêt envoyé au thread d'écriture.
    stop_signal: Arc<AtomicBool>,
    /// Handle du thread d'écriture (prend `Some`, consommé par `stop_and_save`).
    thread_handle: Option<JoinHandle<Vec<f32>>>,
}

impl SynthRecorder {
    /// Démarre le thread d'écriture qui consomme `consumer`.
    ///
    /// Les données sont accumulées en mémoire ; elles seront vidées sur disque
    /// lors de l'appel à [`stop_and_save`].
    pub fn new(mut consumer: HeapCons<f32>) -> Self {
        let stop = Arc::new(AtomicBool::new(false));
        let stop_clone = Arc::clone(&stop);

        let handle = thread::spawn(move || {
            // Pré-allouer pour 60 s stéréo 48 kHz (≈ 5,5 MB).
            let mut samples: Vec<f32> = Vec::with_capacity(48_000 * 2 * 60);

            loop {
                // Drainer le ring buffer sans bloquer.
                while let Some(s) = consumer.try_pop() {
                    samples.push(s);
                }

                if stop_clone.load(Ordering::Relaxed) {
                    // Purge finale avant de quitter.
                    while let Some(s) = consumer.try_pop() {
                        samples.push(s);
                    }
                    break;
                }

                // Pause courte pour ne pas monopoliser le CPU.
                thread::sleep(Duration::from_millis(5));
            }

            samples
        });

        Self {
            stop_signal: stop,
            thread_handle: Some(handle),
        }
    }

    /// Arrête le thread d'écriture, attend sa fin, puis sauvegarde les données
    /// dans un fichier WAV 48 kHz stéréo 32-bit float à `path`.
    ///
    /// Retourne une erreur si le thread a paniqué ou si l'écriture sur disque échoue.
    pub fn stop_and_save(&mut self, path: &str) -> Result<(), String> {
        // Signaler l'arrêt au thread d'écriture.
        self.stop_signal.store(true, Ordering::Relaxed);

        // Attendre la fin du thread et récupérer les données.
        let samples = self
            .thread_handle
            .take()
            .ok_or_else(|| "Thread d'écriture absent".to_string())?
            .join()
            .map_err(|_| "Le thread d'écriture a paniqué".to_string())?;

        // Créer le dossier de destination si nécessaire.
        if let Some(parent) = std::path::Path::new(path).parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }

        // Écrire le fichier WAV.
        let spec = WavSpec {
            channels: 2,
            sample_rate: 48_000,
            bits_per_sample: 32,
            sample_format: SampleFormat::Float,
        };
        let mut writer = WavWriter::create(path, spec).map_err(|e| e.to_string())?;
        for &s in &samples {
            writer.write_sample(s).map_err(|e| e.to_string())?;
        }
        writer.finalize().map_err(|e| e.to_string())?;

        Ok(())
    }
}
