function tone(frequency: number, duration: number, type: OscillatorType = 'sine') {
  const context = new AudioContext();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + duration);
  oscillator.onended = () => context.close();
}

export function playAnswerSound(correct: boolean) {
  if (correct) {
    tone(523, 0.12);
    window.setTimeout(() => tone(784, 0.18), 90);
    return;
  }
  tone(180, 0.22, 'square');
}

export function vibrateError() {
  navigator.vibrate?.(180);
}
