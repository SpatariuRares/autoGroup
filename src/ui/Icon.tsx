import add from '@material-symbols/svg-400/rounded/add.svg?raw';
import arrowDownward from '@material-symbols/svg-400/rounded/arrow_downward.svg?raw';
import arrowUpward from '@material-symbols/svg-400/rounded/arrow_upward.svg?raw';
import bookmarkAdd from '@material-symbols/svg-400/rounded/bookmark_add.svg?raw';
import category from '@material-symbols/svg-400/rounded/category.svg?raw';
import check from '@material-symbols/svg-400/rounded/check.svg?raw';
import close from '@material-symbols/svg-400/rounded/close.svg?raw';
import driveFileMove from '@material-symbols/svg-400/rounded/drive_file_move.svg?raw';
import info from '@material-symbols/svg-400/rounded/info.svg?raw';
import language from '@material-symbols/svg-400/rounded/language.svg?raw';
import lock from '@material-symbols/svg-400/rounded/lock.svg?raw';
import refresh from '@material-symbols/svg-400/rounded/refresh.svg?raw';
import settings from '@material-symbols/svg-400/rounded/settings.svg?raw';
import stop from '@material-symbols/svg-400/rounded/stop.svg?raw';
import tab from '@material-symbols/svg-400/rounded/tab.svg?raw';
import undo from '@material-symbols/svg-400/rounded/undo.svg?raw';
import warning from '@material-symbols/svg-400/rounded/warning.svg?raw';

/**
 * Icone Material Symbols (Rounded) incluse nel pacchetto come SVG: niente font remoti, quindi
 * nessuna richiesta a Google aprendo il pannello. Solo le icone importate qui finiscono nella build.
 */
const ICONS = {
  add,
  arrowDownward,
  arrowUpward,
  bookmarkAdd,
  category,
  check,
  close,
  driveFileMove,
  info,
  language,
  lock,
  refresh,
  settings,
  stop,
  tab,
  undo,
  warning,
} as const;

export type IconName = keyof typeof ICONS;

/** Icona decorativa: il testo accessibile va sul pulsante che la contiene. */
export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return <span className="md-icon" aria-hidden="true" style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: ICONS[name] }} />;
}
