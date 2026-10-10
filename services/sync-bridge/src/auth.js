const crypto = require('crypto');

/**
 * 常量时间比较（先哈希到定长，避免长度泄漏与 timingSafeEqual 长度限制）。
 * token 为空一律拒绝（fail closed）。
 */
function checkAuth(req, token) {
  if (!token || typeof token !== 'string' || token.length < 8) return false;
  const header = req.headers['authorization'] || '';
  const got = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!got) return false;
  const a = crypto.createHash('sha256').update(got).digest();
  const b = crypto.createHash('sha256').update(token).digest();
  return crypto.timingSafeEqual(a, b);
}

module.exports = { checkAuth };
