import { ERR, PHASE } from '../shared/constants.js';
import { TROPHY_SHOP_PRODUCTS, trophyProduct } from '../shared/trophyShop.js';
import { planTrophyPurchase, applyTrophyPurchase } from './match/trophyShop.js';
import { sendSession } from './net.js';

/** Session binding and delivery around the durable trophy store. */
export class ProfileService {
  constructor(store, lobby) {
    this.store = store;
    this.lobby = lobby;
    this.pending = new Map();
    this.retryTimer = null;
  }

  inMatch(profileId) {
    if (!profileId) return false;
    for (const session of this.lobby.registry.byPlayerId.values()) {
      if (session.profileId === profileId && this.lobby.roomOf(session)?.match) return true;
    }
    return false;
  }

  handle(session, msg) {
    if (msg.t === 'profile.bind') {
      const resolved = msg.token ? this.store.resolve(msg.token) : null;
      if (msg.token && !resolved) return { error: ERR.BAD_TARGET, detail: '无法识别档案凭证，请检查恢复文件及服务器' };
      if (session.profileId && resolved?.profileId !== session.profileId && this.inMatch(session.profileId)) {
        return { error: ERR.WRONG_PHASE, detail: '档案正在参战，结束模拟后才能切换档案' };
      }
      const profile = resolved || this.store.create();
      session.profileId = profile.profileId;
      session.profileConfirmed = !!resolved;
      return { ok: true, data: { profile } };
    }
    if (!session.profileId) return { error: ERR.BAD_TARGET, detail: '匿名档案尚未连接' };
    if (msg.t === 'profile.get') return { ok: true, data: { profile: this.store.wallet(session.profileId) } };
    if (msg.t === 'profile.ledger') return { ok: true, data: this.store.ledger(session.profileId, msg.before ?? null) };
    return { error: ERR.BAD_MSG };
  }

  publish(wallet) {
    for (const session of this.lobby.registry.byPlayerId.values()) {
      if (session.profileId === wallet.profileId) sendSession(session, { t: 'profile.wallet', profile: wallet });
    }
  }

  shopState(session) {
    const match = this.lobby.roomOf(session)?.match;
    const ps = match?.players?.get(session.playerId);
    return { profile: this.store.wallet(session.profileId), products: TROPHY_SHOP_PRODUCTS,
      counts: { ...(ps?.trophyShop?.counts || {}) }, matchId: match?.matchId ?? null,
      receipts: ps ? this.store.purchaseRequests(match.matchId, ps.playerId) : [],
      canBuy: !!ps && !ps.isBot && ps.alive && !ps.left && !ps.infoReady && match.phase === PHASE.INFO_CHECK };
  }

  shop(session, msg) {
    if (!session.profileId || !session.profileConfirmed) return { error: ERR.NOT_READY, detail: '匿名档案尚未连接' };
    if (msg.t === 'shop.get') return { ok: true, data: this.shopState(session) };
    const match = this.lobby.roomOf(session)?.match;
    const ps = match?.players?.get(session.playerId);
    if (!ps) return { error: ERR.SPECTATOR };
    if (!this.shopState(session).canBuy) return { error: ERR.WRONG_PHASE, detail: '仅在本局信息确认前购买商品' };
    const product = trophyProduct(msg.productId);
    if (!product) return { error: ERR.BAD_TARGET };
    const plan = planTrophyPurchase(match, ps, product);
    try {
      const receipt = this.store.purchase({ profileId: session.profileId, requestId: msg.requestId,
        matchId: match.matchId, playerId: ps.playerId, product });
      if (receipt.added) applyTrophyPurchase(ps, product, plan);
      this.publish(receipt.wallet);
      return { ok: true, data: { ...this.shopState(session), purchaseId: receipt.purchaseId } };
    } catch (error) {
      if (error.code === 'NO_FUNDS' || error.code === 'BAD_TARGET' || error.code === 'BAD_MSG') {
        return { error: error.code, detail: error.message };
      }
      throw error;
    }
  }

  settle(record) {
    try {
      const wallets = this.store.settleMatch(record);
      this.pending.delete(record.matchId);
      for (const wallet of wallets) this.publish(wallet);
    } catch (error) {
      this.pending.set(record.matchId, record);
      this.lobby.log.error('[profile] 结算尚未入账', record.matchId, error);
      for (const profileId of new Set(Object.values(record.participants))) {
        for (const session of this.lobby.registry.byPlayerId.values()) {
          if (session.profileId === profileId) sendSession(session, { t: 'profile.storageError' });
        }
      }
      if (!this.retryTimer) {
        this.retryTimer = setTimeout(() => {
          this.retryTimer = null;
          for (const pending of [...this.pending.values()]) this.settle(pending);
        }, 5000);
        this.retryTimer.unref();
      }
    }
  }

  close() {
    clearTimeout(this.retryTimer);
    this.retryTimer = null;
    for (const record of [...this.pending.values()]) this.settle(record);
    clearTimeout(this.retryTimer);
    this.store.close();
  }
}
