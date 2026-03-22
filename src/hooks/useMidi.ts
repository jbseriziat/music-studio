import { useState, useCallback } from 'react';
import type { MidiDeviceInfo } from '../types/midi';

/**
 * Hook de gestion MIDI.
 * Phase 3 : connexion réelle aux périphériques via midir/Rust.
 */
export function useMidi() {
  const [devices, setDevices] = useState<MidiDeviceInfo[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(false);

  const listDevices = useCallback(async () => {
    // TODO Phase 3 : invoke('list_midi_devices')
    setDevices([]);
  }, []);

  const connect = useCallback(async (deviceName: string) => {
    // TODO Phase 3 : invoke('connect_midi_device', { deviceName })
    setConnectedDevice(deviceName);
    setIsActive(true);
  }, []);

  const disconnect = useCallback(async () => {
    // TODO Phase 3 : invoke('disconnect_midi_device')
    setConnectedDevice(null);
    setIsActive(false);
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
