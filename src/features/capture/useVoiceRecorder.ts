import { useCallback } from 'react';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';

const OPTIONS = { ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true };

export class MicDeniedError extends Error {}

/** Thin wrapper over expo-audio: start(), stop() → uri, plus live level (0..1) and duration. */
export function useVoiceRecorder() {
  const recorder = useAudioRecorder(OPTIONS);
  const state = useAudioRecorderState(recorder, 120);

  const start = useCallback(async () => {
    const { granted } = await AudioModule.requestRecordingPermissionsAsync();
    if (!granted) throw new MicDeniedError('mic denied');
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
  }, [recorder]);

  const stop = useCallback(async () => {
    await recorder.stop();
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
    return recorder.uri;
  }, [recorder]);

  // metering is dBFS (about -60 silent … 0 loud) → 0..1
  const db = state.metering ?? -60;
  const level = Math.min(Math.max((db + 60) / 60, 0), 1);

  return { start, stop, isRecording: state.isRecording, durationMillis: state.durationMillis, level };
}
