pub mod audio;
pub mod commands;
pub mod drums;
pub mod effects;
pub mod midi;
pub mod mixer;
pub mod project;
pub mod sampler;
pub mod synth;
pub mod transport;

use audio::recorder::Recorder;
use audio::synth_recorder::SynthRecorder;
use audio::AudioEngine;
use midi::MidiEngine;
use sampler::sample_bank::{ensure_samples_exist, load_sample_bank};
use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager};

use commands::audio_commands::{
    add_bus_effect, add_clip, add_effect, add_modulation_route, clear_timeline, create_bus,
    delete_bus, delete_clip, get_compressor_gain_reduction, get_effect_params, move_clip,
    pause, ping_audio, play, remove_effect, remove_modulation_route, reset_lufs,
    set_bus_volume, set_drum_rack_track_id, set_effect_bypass, set_effect_param,
    set_limiter_enabled, set_limiter_threshold, set_loop, set_master_chain_enabled,
    set_master_eq_band, set_master_volume, set_metronome_volume, set_position,
    set_send_amount, set_track_mute, set_track_pan_cmd, set_track_solo, set_track_volume_db,
    stop, update_modulation_route,
};
use commands::automation_commands::{
    add_automation_point, clear_track_automation, delete_automation_point,
    get_automation_lane, update_automation_point,
};
use commands::drum_commands::{
    assign_drum_pad, get_bpm, get_current_step, list_drum_kits, load_drum_kit, set_bpm,
    set_drum_pad_pitch, set_drum_pad_volume, set_drum_pattern, set_drum_step, set_drum_step_count,
    set_metronome, trigger_drum_pad,
};
use commands::project_commands::{
    delete_project, get_project_path, get_projects_dir, list_projects, load_project, new_project,
    save_project,
};
use commands::sample_commands::{
    assign_pad_sample, get_pad_config, get_position, list_samples, load_sample, preview_sample,
    stop_preview, trigger_pad,
};
use commands::settings_commands::{get_audio_devices, get_profiles, save_profiles};
use commands::synth_commands::{
    add_midi_clip, create_synth_track, delete_midi_clip, list_synth_presets, load_synth_preset,
    note_off, note_on, set_synth_param, update_midi_clip_notes,
};
use commands::midi_commands::{
    connect_midi_device, disconnect_midi_device, list_midi_devices, set_midi_active_track,
};
use commands::recorder_commands::{
    arm_track, get_armed_track, is_recording_active, list_input_devices, set_input_device,
    set_monitoring, start_recording, start_synth_recording, stop_recording, stop_synth_recording,
};
use commands::export_commands::{export_project, get_export_path, import_audio_file};

/// Commande de test IPC (Phase 0)
#[tauri::command]
fn ping(message: String) -> String {
    format!("pong: {}", message)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // Déterminer le dossier de données de l'application.
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("Impossible de déterminer app_data_dir");

            // Générer les samples synthétiques si le dossier n'existe pas encore.
            let samples_dir = ensure_samples_exist(&app_data_dir);

            // Charger la banque de samples.
            let bank = load_sample_bank(&samples_dir);

            // Initialiser le moteur audio.
            let engine = AudioEngine::new();

            // Pré-charger les 16 premiers samples dans le thread audio (pads par défaut).
            for i in 0..16usize {
                if let Some((data, channels, sr)) = bank.audio_data.get(i) {
                    engine.send_command(audio::commands::AudioCommand::LoadSample {
                        id: i as u32,
                        data: std::sync::Arc::clone(data),
                        channels: *channels,
                        sample_rate: *sr,
                    });
                    engine.send_command(audio::commands::AudioCommand::AssignPad {
                        pad_id: i as u8,
                        sample_id: Some(i as u32),
                    });
                }
            }

            // ── Thread de métrologie VU-mètres (~30 fps) ──────────────────────
            {
                let meter_report = Arc::clone(&engine.meter_report);
                let handle = app.handle().clone();
                std::thread::spawn(move || loop {
                    std::thread::sleep(std::time::Duration::from_millis(33));
                    if let Ok(report) = meter_report.lock() {
                        let _ = handle.emit("audio://meters", report.clone());
                    }
                });
            }

            app.manage(Mutex::new(engine));
            app.manage(Mutex::new(bank));
            // Initialiser le moteur MIDI.
            app.manage(Mutex::new(MidiEngine::new()));
            // Initialiser le recorder (enregistrement micro).
            app.manage(Mutex::new(Recorder::new()));
            // Initialiser le SynthRecorder (enregistrement synthé, inactif par défaut).
            app.manage(Mutex::new(Option::<SynthRecorder>::None));
            Ok(())
        })
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            // IPC de test
            ping,
            // Transport
            play,
            pause,
            stop,
            set_master_volume,
            ping_audio,
            set_position,
            // Clips & transport avancé
            add_clip,
            move_clip,
            delete_clip,
            clear_timeline,
            set_loop,
            set_track_mute,
            set_track_solo,
            set_metronome_volume,
            set_track_volume_db,
            set_track_pan_cmd,
            set_drum_rack_track_id,
            // Effets
            add_effect,
            remove_effect,
            set_effect_param,
            set_effect_bypass,
            get_effect_params,
            get_compressor_gain_reduction,
            // Mod matrix (Phase 5.2)
            add_modulation_route,
            update_modulation_route,
            remove_modulation_route,
            // Master chain (Phase 5.3)
            set_master_chain_enabled,
            set_master_eq_band,
            set_limiter_threshold,
            set_limiter_enabled,
            reset_lufs,
            // Bus d'effets (Phase 5.4)
            create_bus,
            delete_bus,
            add_bus_effect,
            set_bus_volume,
            set_send_amount,
            // Samples & pads
            trigger_pad,
            assign_pad_sample,
            list_samples,
            load_sample,
            preview_sample,
            stop_preview,
            get_position,
            get_pad_config,
            // Drum rack & séquenceur
            set_bpm,
            get_bpm,
            set_drum_step,
            assign_drum_pad,
            trigger_drum_pad,
            set_metronome,
            get_current_step,
            set_drum_step_count,
            set_drum_pattern,
            set_drum_pad_volume,
            set_drum_pad_pitch,
            load_drum_kit,
            list_drum_kits,
            // Synthétiseur
            create_synth_track,
            note_on,
            note_off,
            set_synth_param,
            load_synth_preset,
            list_synth_presets,
            // Piano Roll / MIDI clips
            add_midi_clip,
            update_midi_clip_notes,
            delete_midi_clip,
            // MIDI
            list_midi_devices,
            connect_midi_device,
            disconnect_midi_device,
            set_midi_active_track,
            // Settings
            get_audio_devices,
            get_profiles,
            save_profiles,
            // Project
            new_project,
            save_project,
            load_project,
            list_projects,
            get_projects_dir,
            get_project_path,
            delete_project,
            // Enregistrement
            list_input_devices,
            set_input_device,
            arm_track,
            set_monitoring,
            start_recording,
            stop_recording,
            get_armed_track,
            is_recording_active,
            // Enregistrement synthé (capture interne)
            start_synth_recording,
            stop_synth_recording,
            // Export & Import
            export_project,
            import_audio_file,
            get_export_path,
            // Automation
            add_automation_point,
            update_automation_point,
            delete_automation_point,
            get_automation_lane,
            clear_track_automation,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
