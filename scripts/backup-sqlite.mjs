import { DatabaseSync } from "node:sqlite";

const source = process.argv[2];
const dest = process.argv[3];
if (!source || !dest) {
  console.error("Usage: node scripts/backup-sqlite.mjs <source.sqlite> <backup.sqlite>");
  process.exit(1);
}

const escaped = dest.replaceAll("'", "''");
const db = new DatabaseSync(source);
try {
  db.exec(`VACUUM INTO '${escaped}'`);
} finally {
  db.close();
}
console.log("backup written");
