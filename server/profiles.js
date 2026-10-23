import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export const isProfileToken = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const digest = token => createHash('sha256').update(token).digest('hex');
const INITIAL_TROPHIES = { source: 'initial', sourceId: 'anonymous-v1', delta: 10 };

/** Durable anonymous profiles and their trophy ledger. One instance belongs to a server. */
export class ProfileStore {
  constructor(filename, { now = Date.now } = {}) {
    if (filename !== ':memory:') mkdirSync(path.dirname(filename), { recursive: true });
    this.now = now;
    this.db = new DatabaseSync(filename);
    this.db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
    try { this.transaction(() => {
      const version = this.db.prepare('PRAGMA user_version').get().user_version;
      if (version > 3) throw new Error('玩家档案数据库版本高于当前程序支持的版本');
      if (version === 0) this.db.exec(`
        CREATE TABLE profiles (
          id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE,
          created_at INTEGER NOT NULL, seen_at INTEGER NOT NULL
        ) STRICT;
        CREATE TABLE wallets (
          profile_id TEXT PRIMARY KEY REFERENCES profiles(id),
          earned INTEGER NOT NULL DEFAULT 0 CHECK(earned >= 0),
          balance INTEGER NOT NULL DEFAULT 0 CHECK(balance >= 0),
          revision INTEGER NOT NULL DEFAULT 0
        ) STRICT;
        CREATE TABLE matches (
          id TEXT PRIMARY KEY, started_at INTEGER NOT NULL, settled_at INTEGER NOT NULL, summary TEXT NOT NULL
        ) STRICT;
        CREATE TABLE match_players (
          match_id TEXT NOT NULL REFERENCES matches(id), player_id TEXT NOT NULL,
          profile_id TEXT NOT NULL REFERENCES profiles(id), trophies INTEGER NOT NULL CHECK(trophies >= 0),
          summary TEXT NOT NULL, PRIMARY KEY(match_id, player_id)
        ) STRICT;
        CREATE TABLE trophy_ledger (
          id INTEGER PRIMARY KEY AUTOINCREMENT, profile_id TEXT NOT NULL REFERENCES profiles(id),
          source TEXT NOT NULL, source_id TEXT NOT NULL, delta INTEGER NOT NULL, earned_delta INTEGER NOT NULL,
          balance_after INTEGER NOT NULL, earned_after INTEGER NOT NULL, created_at INTEGER NOT NULL,
          UNIQUE(profile_id, source, source_id)
        ) STRICT;
        CREATE INDEX ledger_profile ON trophy_ledger(profile_id, id DESC);
        CREATE TABLE purchases (
          id TEXT PRIMARY KEY, profile_id TEXT NOT NULL REFERENCES profiles(id), request_id TEXT NOT NULL,
          match_id TEXT NOT NULL, player_id TEXT NOT NULL, product_id TEXT NOT NULL, purchase_group TEXT NOT NULL,
          price INTEGER NOT NULL CHECK(price >= 0), created_at INTEGER NOT NULL,
          UNIQUE(profile_id, request_id)
        ) STRICT;
        CREATE INDEX purchases_match_player ON purchases(match_id, player_id, purchase_group);
        PRAGMA user_version=1;
      `);
      if (version < 2) {
        for (const { profile_id } of this.db.prepare('SELECT profile_id FROM wallets').all()) {
          this.change(profile_id, INITIAL_TROPHIES);
        }
        this.db.exec('PRAGMA user_version=2;');
      }
      if (version < 3) this.db.exec(`
        CREATE TABLE admin_adjustments (
          id TEXT PRIMARY KEY, profile_id TEXT NOT NULL REFERENCES profiles(id),
          balance INTEGER NOT NULL, earned INTEGER NOT NULL, reason TEXT NOT NULL,
          created_at INTEGER NOT NULL
        ) STRICT;
        PRAGMA user_version=3;
      `);
    }); } catch (error) { this.db.close(); throw error; }
  }

  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  create() {
    const token = randomBytes(32).toString('hex');
    const id = randomUUID();
    const t = this.now();
    this.transaction(() => {
      this.db.prepare('INSERT INTO profiles VALUES (?, ?, ?, ?)').run(id, digest(token), t, t);
      this.db.prepare('INSERT INTO wallets(profile_id) VALUES (?)').run(id);
      this.change(id, INITIAL_TROPHIES);
    });
    return { token, ...this.wallet(id) };
  }

  resolve(token) {
    if (!isProfileToken(token)) return null;
    const row = this.db.prepare('SELECT id FROM profiles WHERE token_hash=?').get(digest(token));
    if (!row) return null;
    this.db.prepare('UPDATE profiles SET seen_at=? WHERE id=?').run(this.now(), row.id);
    return this.wallet(row.id);
  }

  wallet(profileId) {
    const row = this.db.prepare('SELECT earned, balance, revision FROM wallets WHERE profile_id=?').get(profileId);
    return row ? { profileId, lifetimeEarned: row.earned, balance: row.balance, revision: row.revision } : null;
  }

  purchaseRequests(matchId, playerId) {
    return this.db.prepare('SELECT request_id FROM purchases WHERE match_id=? AND player_id=?')
      .all(matchId, playerId).map(row => row.request_id);
  }

  ledger(profileId, before = null, limit = 50) {
    const rows = this.db.prepare(`SELECT l.id, source, source_id AS sourceId, delta, earned_delta AS earnedDelta,
      balance_after AS balanceAfter, earned_after AS earnedAfter, l.created_at AS createdAt, a.reason
      FROM trophy_ledger l LEFT JOIN admin_adjustments a ON l.source='admin' AND a.id=l.source_id
      WHERE l.profile_id=? AND (? IS NULL OR l.id<?) ORDER BY l.id DESC LIMIT ?`)
      .all(profileId, before, before, limit);
    return { rows, next: rows.length === limit ? rows.at(-1).id : null };
  }

  setWallet({ profileId, balance, lifetimeEarned, revision, requestId, reason }) {
    return this.transaction(() => {
      const old = this.db.prepare('SELECT * FROM admin_adjustments WHERE id=?').get(requestId);
      if (old) {
        if (old.profile_id !== profileId || old.balance !== balance || old.earned !== lifetimeEarned || old.reason !== reason) {
          throw Object.assign(new Error('修改编号已用于其他操作'), { status: 409 });
        }
        return this.wallet(profileId);
      }
      const wallet = this.wallet(profileId);
      if (!wallet) throw Object.assign(new Error('匿名档案不存在'), { status: 404 });
      if (wallet.revision !== revision) throw Object.assign(new Error('奖杯已发生变化，请重新查询后核对修改'), { status: 409 });
      this.change(profileId, { source: 'admin', sourceId: requestId,
        delta: balance - wallet.balance, earnedDelta: lifetimeEarned - wallet.lifetimeEarned });
      this.db.prepare('INSERT INTO admin_adjustments VALUES (?,?,?,?,?,?)')
        .run(requestId, profileId, balance, lifetimeEarned, reason, this.now());
      return this.wallet(profileId);
    });
  }

  change(profileId, { source, sourceId, delta, earnedDelta = 0 }) {
    const old = this.db.prepare('SELECT * FROM trophy_ledger WHERE profile_id=? AND source=? AND source_id=?')
      .get(profileId, source, sourceId);
    if (old) {
      if (old.delta !== delta || old.earned_delta !== earnedDelta) throw new Error('奖杯流水业务编号重复且内容不同');
      return this.wallet(profileId);
    }
    const changed = this.db.prepare(`UPDATE wallets SET earned=earned+?, balance=balance+?, revision=revision+1
      WHERE profile_id=? AND balance+?>=0`).run(earnedDelta, delta, profileId, delta);
    if (!changed.changes) throw Object.assign(new Error('可用奖杯不足'), { code: 'NO_FUNDS' });
    const wallet = this.wallet(profileId);
    this.db.prepare(`INSERT INTO trophy_ledger
      (profile_id,source,source_id,delta,earned_delta,balance_after,earned_after,created_at) VALUES (?,?,?,?,?,?,?,?)`)
      .run(profileId, source, sourceId, delta, earnedDelta, wallet.balance, wallet.lifetimeEarned, this.now());
    return wallet;
  }

  /** Called once from the match's final summary; retries may safely pass the same match. */
  settleMatch({ matchId, startedAt, participants, summary }) {
    return this.transaction(() => {
      this.db.prepare('INSERT OR IGNORE INTO matches VALUES (?,?,?,?)')
        .run(matchId, startedAt, this.now(), JSON.stringify(summary));
      const changed = new Set();
      for (const row of summary.players || []) {
        const profileId = participants[row.playerId];
        if (!profileId || row.isBot) continue;
        const trophies = Math.max(0, Math.trunc(row.trophies || 0));
        const added = this.db.prepare('INSERT OR IGNORE INTO match_players VALUES (?,?,?,?,?)')
          .run(matchId, row.playerId, profileId, trophies, JSON.stringify(row));
        if (!added.changes) continue;
        this.change(profileId, { source: 'match', sourceId: `${matchId}:${row.playerId}`, delta: trophies, earnedDelta: trophies });
        changed.add(profileId);
      }
      return [...changed].map(id => this.wallet(id));
    });
  }

  /** Product, price and per-match limit are server catalogue values, never client prices. */
  purchase({ profileId, requestId, matchId, playerId, product }) {
    if (!Number.isSafeInteger(product.price) || product.price < 0) {
      throw Object.assign(new Error('该商品尚未定价'), { code: 'BAD_TARGET' });
    }
    return this.transaction(() => {
      const old = this.db.prepare('SELECT * FROM purchases WHERE profile_id=? AND request_id=?').get(profileId, requestId);
      if (old) {
        if (old.match_id !== matchId || old.player_id !== playerId || old.product_id !== product.id) {
          throw Object.assign(new Error('购买编号已用于其他商品'), { code: 'BAD_MSG' });
        }
        return { purchaseId: old.id, added: false, wallet: this.wallet(profileId) };
      }
      const count = this.db.prepare('SELECT COUNT(*) AS n FROM purchases WHERE match_id=? AND player_id=? AND purchase_group=?')
        .get(matchId, playerId, product.group).n;
      if (count >= product.limit) throw Object.assign(new Error('本局已达到购买次数上限'), { code: 'BAD_TARGET' });
      const id = randomUUID();
      const wallet = this.change(profileId, { source: 'purchase', sourceId: id, delta: -product.price });
      this.db.prepare('INSERT INTO purchases VALUES (?,?,?,?,?,?,?,?,?)')
        .run(id, profileId, requestId, matchId, playerId, product.id, product.group, product.price, this.now());
      return { purchaseId: id, added: true, wallet };
    });
  }

  close() { this.db.close(); }
}
