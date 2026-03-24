import { useState, useCallback } from 'react';
import type { MidiDeviceInfo } from '../types/midi';
import {
  listMidiDevices,
  connectMidiDevice,
  disconnectMidiDevice,
} from '../utils/tauri-commands';

/**
 * Hook de gestion MIDI.
 * Expose la liste des périphériques d'entrée et les actions de connexion.
 */
export function useMidi() {
  const [devices, setDevices] = useState<MidiDeviceInfo[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(false);

  /** Rafraîchit la liste des périphériques MIDI disponibles. */
  const listDevices = useCallback(async () => {
    try {
      const devs = await listMidiDevices();
      setDevices(devs.map((d) => ({ name: d.name, isConnected: d.is_connected })));
    } catch (err) {
      console.warn('[useMidi] list_midi_devices :', err);
      setDevices([]);
    }
  }, []);

  /** Connecte un périphérique MIDI par son nom. */
  const connect = useCallback(async (deviceName: string) => {
    try {
      await connectMidiDevice(deviceName);
      setConnectedDevice(deviceName);
      setIsActive(true);
    } catch (err) {
      console.error('[useMidi] connect_midi_device :', err);
    }
  }, []);

  /** Déconnecte le périphérique MIDI actif. */
  const disconnect = useCallback(async () => {
    try {
      await disconnectMidiDevice();
      setConnectedDevice(null);
      setIsActive(false);
    } catch (err) {
      console.error('[useMidi] disconnect_midi_device :', err);
    }
  }, []);

  return {
    devices,
    connectedDevice,
    isActive,
    listDevices,
    connect,
    disconnect,
  };
}
