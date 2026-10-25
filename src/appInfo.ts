/**
 * The product name. Also written by hand in index.html (<title>, og:title — link previews read
 * the HTML before any JS runs) and the manifest short_name. Safe to change at any time.
 */
export const APP_NAME = 'Keypad Arcade';

/**
 * IndexedDB database name. Unlike APP_NAME, changing this after launch orphans every player's
 * saved scores — it would need a migration from the old database.
 */
export const DB_NAME = 'keypad-arcade';
