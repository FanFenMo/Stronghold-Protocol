const PROFILE_ID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
const validId = value => typeof value === 'string' && PROFILE_ID.test(value);
const validCount = value => Number.isSafeInteger(value) && value >= 0;

function json(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

/** Management data is never part of the public lobby or match broadcasts. */
export function createAdminHandler({ access, lobby, log }) {
  return async (req, res, rawPath) => {
    if (!rawPath.startsWith('/api/admin/')) return false;
    if (!access.isAdmin(req)) {
      json(res, 403, { message: '请使用管理员账号登录' });
      return true;
    }
    if (rawPath === '/api/admin/matches' && req.method === 'GET') {
      const matches = [];
      for (const room of lobby.rooms.values()) {
        if (!room.match || room.match.ended || room.match.disposed || room.matchCtx?.ended) continue;
        matches.push({ code: room.code, mode: room.mode, difficulty: room.difficulty, ultimateLevel: room.ultimateLevel,
          phase: room.match.phase, round: room.match.round, spectators: room.spectators.length,
          players: room.seats.filter(Boolean).map(seat => ({ playerId: seat.playerId, name: seat.name,
            isBot: seat.isBot, connected: seat.connected, left: seat.left,
            profileId: room.matchCtx?.profileMatch?.participants[seat.playerId] || lobby.registry.byId(seat.playerId)?.profileId || null })) });
      }
      json(res, 200, { matches });
      return true;
    }
    const store = lobby.profiles?.store;
    if (!store) { json(res, 503, { message: '玩家档案未启用' }); return true; }
    if (rawPath === '/api/admin/profiles' && req.method === 'GET') {
      const params = new URL(req.url, 'http://localhost').searchParams;
      const search = (params.get('q') || '').trim();
      const page = Number(params.get('page') || 1);
      if (search.length > 80 || !Number.isSafeInteger(page) || page < 1 || page > 1000000) {
        json(res, 400, { message: '账号搜索内容或页码不正确' }); return true;
      }
      const result = store.accounts({ search, page });
      const online = new Set([...lobby.registry.byPlayerId.values()].filter(s => s.connected && s.profileConfirmed).map(s => s.profileId));
      for (const profile of result.profiles) profile.online = online.has(profile.profileId);
      json(res, 200, result);
      return true;
    }
    if (rawPath === '/api/admin/self' && req.method === 'GET') {
      const profile = store.resolve(req.headers['x-profile-token']);
      json(res, profile ? 200 : 404, profile ? { profile, account: store.account(profile.profileId), ledger: store.ledger(profile.profileId).rows }
        : { message: '请先打开游戏并连接自己的匿名档案' });
      return true;
    }
    if (rawPath === '/api/admin/profile' && req.method === 'GET') {
      const profileId = new URL(req.url, 'http://localhost').searchParams.get('id') || '';
      const profile = PROFILE_ID.test(profileId) ? store.wallet(profileId) : null;
      json(res, profile ? 200 : 404, profile ? { profile, account: store.account(profileId), ledger: store.ledger(profileId).rows } : { message: '匿名档案不存在，请核对完整档案 ID' });
      return true;
    }
    if (rawPath === '/api/admin/profile' && req.method === 'POST') {
      const origin = req.headers.origin;
      if (origin && origin !== `http://${req.headers.host}` && origin !== `https://${req.headers.host}`) {
        json(res, 403, { message: '修改请求必须来自本站' }); return true;
      }
      if (String(req.headers['content-type'] || '').split(';')[0].trim() !== 'application/json') {
        json(res, 415, { message: '请提交 JSON 格式的修改' }); return true;
      }
      const chunks = [];
      let size = 0;
      for await (const chunk of req) { size += chunk.length; if (size <= 8192) chunks.push(chunk); }
      if (size > 8192) { json(res, 413, { message: '修改内容过长' }); return true; }
      let body;
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { json(res, 400, { message: '修改内容格式不正确' }); return true; }
      if (!body || !validId(body.profileId) || !validId(body.requestId)
        || !validCount(body.balance) || !validCount(body.lifetimeEarned) || !validCount(body.revision)
        || typeof body.reason !== 'string' || !body.reason.trim() || body.reason.length > 200) {
        json(res, 400, { message: '请填写完整档案 ID、非负整数奖杯数和修改原因（最多 200 字）' }); return true;
      }
      try {
        const profile = store.setWallet(body);
        lobby.profiles.publish(profile);
        json(res, 200, { profile, account: store.account(profile.profileId), ledger: store.ledger(profile.profileId).rows });
      } catch (error) {
        if (!error.status) log.error('[admin] wallet adjustment failed', error);
        json(res, error.status || 500, { message: error.status ? error.message : '奖杯修改保存失败，请稍后重试' });
      }
      return true;
    }
    json(res, 405, { message: '不支持的管理操作' });
    return true;
  };
}
