import { definePreset } from '@primeuix/themes'
import Aura from '@primeuix/themes/aura'

/** `{indigo.50}` … `{indigo.950}`: a full scale pointing at one of Aura's built-in palettes. */
const palette = (name: string) =>
  Object.fromEntries(
    [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map((step) => [
      step,
      `{${name}.${step}}`,
    ]),
  )

/**
 * The app's one source of color: PrimeVue's Aura theme with an indigo primary. Components use it
 * directly, and main.css maps the Tailwind tokens (bg-panel, text-muted, …) onto the same variables,
 * so custom layout and PrimeVue components always match.
 */
export const GlossTheme = definePreset(Aura, {
  semantic: {
    primary: palette('indigo'),
    colorScheme: {
      light: {
        // Aura uses the 500 shade by default; with white text that's below WCAG AA contrast.
        // 600 is about 6:1.
        primary: {
          color: '{primary.600}',
          contrastColor: '#ffffff',
          hoverColor: '{primary.700}',
          activeColor: '{primary.800}',
        },
        highlight: {
          background: '{primary.50}',
          focusBackground: '{primary.100}',
          color: '{primary.700}',
          focusColor: '{primary.800}',
        },
      },
    },
  },
  components: {
    // Same reason for danger: Aura's red.500 is under 4.5:1 against white, as a fill or as text.
    button: {
      colorScheme: {
        light: {
          root: {
            danger: {
              background: '{red.600}',
              hoverBackground: '{red.700}',
              activeBackground: '{red.800}',
              borderColor: '{red.600}',
              hoverBorderColor: '{red.700}',
              activeBorderColor: '{red.800}',
              focusRing: { color: '{red.600}', shadow: 'none' },
            },
          },
          text: { danger: { color: '{red.600}' } },
          outlined: { danger: { color: '{red.600}' } },
        },
      },
    },
  },
})
