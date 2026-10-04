// Genera src/ui/md3-tokens.css: i colori Material 3 (ruoli --md-sys-color-*) per tema chiaro e scuro,
// a partire da un unico colore di partenza con @material/material-color-utilities.
// Uso: npm run theme [-- #colore]   (default: il blu di Chrome). Gira con scripts/js-extension-loader.mjs,
// perché il pacchetto importa i propri file senza estensione.
import { writeFileSync } from 'node:fs';
import { argbFromHex, hexFromArgb, Hct, MaterialDynamicColors, SchemeTonalSpot } from '@material/material-color-utilities';

const seed = process.argv[2] ?? '#1a73e8';
const roles = [
  'primary', 'onPrimary', 'primaryContainer', 'onPrimaryContainer',
  'secondary', 'onSecondary', 'secondaryContainer', 'onSecondaryContainer',
  'tertiary', 'onTertiary', 'tertiaryContainer', 'onTertiaryContainer',
  'error', 'onError', 'errorContainer', 'onErrorContainer',
  'surface', 'onSurface', 'onSurfaceVariant', 'surfaceDim', 'surfaceBright',
  'surfaceContainerLowest', 'surfaceContainerLow', 'surfaceContainer', 'surfaceContainerHigh', 'surfaceContainerHighest',
  'inverseSurface', 'inverseOnSurface', 'inversePrimary', 'outline', 'outlineVariant', 'scrim', 'shadow',
];
const kebab = (s) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const block = (dark) => {
  const scheme = new SchemeTonalSpot(Hct.fromInt(argbFromHex(seed)), dark, 0);
  return roles.map((r) => `  --md-sys-color-${kebab(r)}: ${hexFromArgb(MaterialDynamicColors[r].getArgb(scheme))};`).join('\n');
};
const css = `/* Generato da scripts/generate-theme.mjs (colore di partenza ${seed}, schema Tonal Spot). Non modificare a mano. */
:root {
${block(false)}
}
@media (prefers-color-scheme: dark) {
  :root {
${block(true).replace(/^/gm, '  ')}
  }
}
`;
writeFileSync('src/ui/md3-tokens.css', css);
console.log(css);
