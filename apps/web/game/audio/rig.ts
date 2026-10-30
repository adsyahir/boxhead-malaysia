/** What a sound generator needs: the shared AudioContext and the master output (which carries volume and mute). */
export interface AudioRig {
  ctx: AudioContext;
  out: AudioNode;
}
