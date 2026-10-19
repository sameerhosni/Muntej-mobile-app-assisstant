import { useCallback, useRef } from 'react';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';

// speech, not music: 16 kHz mono AAC is what speech-to-text uses anyway, and uploads ~5x smaller than HIGH_QUALITY
const OPTIONS = {
  ...RecordingPresets.HIGH_QUALITY,
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 32000,
  isMeteringEnabled: true,
};

export class MicDeniedError extends Error {}

/** Thin wrapper over expo-audio: start(), stop() → uri, plus live level (0..1) and duration. */
export function useVoiceRecorder() {
  const recorder = useAudioRecorder(OPTIONS);
  const state = useAudioRecorderState(recorder, 120);
  // loudest moment of the current recording (null = this platform reports no metering, e.g. some web browsers)
  const peak = useRef<number | null>(null);

  const start = useCallback(async () => {
    const { granted } = await AudioModule.requestRecordingPermissionsAsync();
    if (!granted) throw new MicDeniedError('mic denied');
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    peak.current = null;
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
  if (state.isRecording && state.metering != null) peak.current = Math.max(peak.current ?? 0, level);

  /** true when metering showed nothing above room noise for the whole recording */
  const wasSilent = () => peak.current !== null && peak.current < 0.3;

  return { start, stop, wasSilent, isRecording: state.isRecording, durationMillis: state.durationMillis, level };
}
