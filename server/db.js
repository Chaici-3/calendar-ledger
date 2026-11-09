import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, 'data');

fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'ledger.db'));

// 级联删除依赖外键约束，必须显式开启
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS records (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    amount_cents INTEGER NOT NULL,
    note         TEXT,
    is_hobby     INTEGER NOT NULL DEFAULT 0,
    date         TEXT NOT NULL DEFAULT (date('now','localtime')),
    created_at   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS tags (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT
  );
`);

// v0.2 迁移：旧库的 records 表没有 date 列，CREATE TABLE IF NOT EXISTS 不会补列
const hasDateColumn = db
  .prepare("SELECT name FROM pragma_table_info('records')")
  .all()
  .some((column) => column.name === 'date');

if (!hasDateColumn) {
  db.exec("ALTER TABLE records ADD COLUMN date TEXT NOT NULL DEFAULT ''");
  db.exec("UPDATE records SET date = date(created_at) WHERE date = ''");
}

// v0.3 迁移：tags 表补 is_preset（只把「爱好」标记为预置，留给兴趣预算）
const hasIsPresetColumn = db
  .prepare("SELECT name FROM pragma_table_info('tags')")
  .all()
  .some((column) => column.name === 'is_preset');

if (!hasIsPresetColumn) {
  db.exec('ALTER TABLE tags ADD COLUMN is_preset INTEGER NOT NULL DEFAULT 0');
}

// v0.5 迁移：records 补 type，旧记录默认为支出
const hasTypeColumn = db
  .prepare("SELECT name FROM pragma_table_info('records')")
  .all()
  .some((column) => column.name === 'type');

if (!hasTypeColumn) {
  db.exec(
    "ALTER TABLE records ADD COLUMN type TEXT NOT NULL DEFAULT 'expense' CHECK (type IN ('expense','income'))"
  );
}

db.exec(`
  INSERT OR IGNORE INTO tags (name, is_preset) VALUES
    ('餐饮', 0), ('交通', 0), ('爱好', 1), ('购物', 0), ('其他', 0);

  UPDATE tags SET is_preset = 1 WHERE name = '爱好';

  CREATE TABLE IF NOT EXISTS record_tags (
    record_id INTEGER NOT NULL REFERENCES records(id) ON DELETE CASCADE,
    tag_id    INTEGER NOT NULL REFERENCES tags(id)    ON DELETE CASCADE,
    PRIMARY KEY (record_id, tag_id)
  );

  CREATE INDEX IF NOT EXISTS idx_record_tags_tag_id ON record_tags(tag_id);

  CREATE INDEX IF NOT EXISTS idx_records_date ON records(date);

  CREATE TABLE IF NOT EXISTS impulse_records (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    item_name    TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    status       TEXT NOT NULL DEFAULT 'waiting'
                 CHECK (status IN ('waiting','purchased','abandoned')),
    created_at   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  -- impulse_id 允许 NULL：未关联具体物品的闲聊也存一份
  CREATE TABLE IF NOT EXISTS impulse_messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    impulse_id INTEGER REFERENCES impulse_records(id) ON DELETE CASCADE,
    role       TEXT NOT NULL CHECK (role IN ('user','agent')),
    content    TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE INDEX IF NOT EXISTS idx_impulse_messages_impulse ON impulse_messages(impulse_id);
`);

export default db;
