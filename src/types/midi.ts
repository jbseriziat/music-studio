/** Informations sur un périphérique MIDI */
export interface MidiDeviceInfo {
  name: string;
  isConnected: boolean;
}

/** Événement MIDI brut */
export interface MidiEvent {
  type: 'note_on' | 'note_off' | 'control_change';
  channel: number;
  data1: number;  // note ou numéro de contrôleur
  data2: number;  // vélocité ou valeur
  timestamp: number;
}

/** Mapping MIDI → action interne */
export interface MidiMapping {
  channel: number;
  controller: number;
  action: string;
}
