import { expect, it } from 'vitest';
import { createTheme } from '../src/view/themes';

it('Crystal starts with the exaggerated combined study and only caustics request ambient redraws', () => {
  const theme = createTheme('crystal');
  expect(theme.optical!.get()).toEqual({ refraction: true, spectral: true, caustics: true, inclusions: false });
  expect(theme.postprocessing!.enabled).toBe(true);
  theme.optical!.set({ refraction: false, spectral: false, caustics: false, inclusions: false });
  expect(theme.postprocessing!.enabled).toBe(false);
  for (const key of ['refraction', 'spectral', 'caustics', 'inclusions'] as const) {
    const options = { refraction: false, spectral: false, caustics: false, inclusions: false, [key]: true };
    theme.optical!.set(options);
    options[key] = false;
    expect(theme.optical!.get()[key]).toBe(true); // runtime owns its options
    expect(theme.postprocessing!.enabled).toBe(true);
    expect(theme.update(1000, true)).toBe(key === 'caustics');
    expect(theme.update(1010, true)).toBe(false); // capped animation cadence
    expect(theme.update(1100, false)).toBe(false); // reduced motion / animation off
  }
  theme.postprocessing!.dispose(); theme.dispose();
});

it('Diagnostic and Luminous do not acquire an optical pass or options', () => {
  for (const id of ['diagnostic', 'luminous'] as const) {
    const theme = createTheme(id);
    expect(theme.optical).toBeUndefined(); expect(theme.postprocessing).toBeUndefined();
    theme.dispose();
  }
});
