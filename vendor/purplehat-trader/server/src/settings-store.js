import { envDefaults, normalizeSettings, validateSettings } from "../../shared/settings.js";

function upgradeLegacy(settings) {
  const next = { ...settings };
  if (next.pivotLeft4h == null) next.pivotLeft4h = 3;
  if (next.pivotRight4h == null) next.pivotRight4h = 3;
  if (next.pivotLeft1d == null) next.pivotLeft1d = 2;
  if (next.pivotRight1d == null) next.pivotRight1d = 2;
  if (next.divMinBars === 5) next.divMinBars = 3;
  if (next.divMaxBars1d == null) next.divMaxBars1d = 40;
  return next;
}

export function getSettings(db) {
  const row = db.prepare("SELECT json FROM app_settings WHERE id = 1").get();
  if (!row) return envDefaults();
  return upgradeLegacy(normalizeSettings(JSON.parse(row.json)));
}

export function saveSettings(db, input, at = Date.now()) {
  const result = validateSettings(input);
  if (!result.ok) return result;
  db.prepare(`
    INSERT INTO app_settings (id, json, updated_at) VALUES (1, ?, ?)
    ON CONFLICT(id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at
  `).run(JSON.stringify(result.settings), at);
  return result;
}
