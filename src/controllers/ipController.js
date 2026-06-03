const { success } = require('../utils/response');
const VisitorLog = require('../models/VisitorLog');

function getClientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return xff.split(',')[0].trim();
  return req.headers['x-real-ip'] || req.ip || req.socket?.remoteAddress || '0.0.0.0';
}

function isLocalIp(ip) {
  return (
    ip === '127.0.0.1' ||
    ip === '::1' ||
    ip === '::ffff:127.0.0.1' ||
    ip.startsWith('192.168.') ||
    ip.startsWith('10.') ||
    ip.startsWith('172.')
  );
}

async function fetchGeoInfo(ip) {
  if (isLocalIp(ip)) {
    return { ip, country: 'Local', countryCode: null, city: 'Localhost', isp: 'Local Network', isVN: false, isLocal: true };
  }
  try {
    const r = await fetch(
      `http://ip-api.com/json/${ip}?fields=status,country,countryCode,city,isp&lang=vi`,
      { signal: AbortSignal.timeout(5000) }
    );
    const geo = await r.json();
    return {
      ip,
      country:     geo.country     ?? null,
      countryCode: geo.countryCode ?? null,
      city:        geo.city        ?? null,
      isp:         geo.isp         ?? null,
      isVN:        geo.countryCode === 'VN',
      isLocal:     false,
    };
  } catch {
    return { ip, country: null, countryCode: null, city: null, isp: null, isVN: null, isLocal: false };
  }
}

// GET /api/v1/ip
exports.getIpInfo = async (req, res) => {
  const ip = getClientIp(req);
  const info = await fetchGeoInfo(ip);
  return success(res, info);
};

// POST /api/v1/ip/visit  — called once per session from frontend
exports.trackVisit = async (req, res) => {
  const ip = getClientIp(req);
  const { page, referrer } = req.body;
  const userAgent = req.headers['user-agent'] || '';

  // Fire-and-forget geo lookup + save; respond immediately
  res.json({ success: true });

  try {
    const geo = await fetchGeoInfo(ip);
    await VisitorLog.create({
      ip:          geo.ip,
      country:     geo.country,
      countryCode: geo.countryCode,
      city:        geo.city,
      isp:         geo.isp,
      isVN:        geo.isVN,
      isLocal:     geo.isLocal,
      page:        page   || '/',
      referrer:    referrer || null,
      userAgent,
    });
  } catch { /* swallow — tracking must never break UX */ }
};

// GET /api/v1/admin/visitors  — admin stats
exports.getVisitors = async (req, res) => {
  const [logs, total] = await Promise.all([
    VisitorLog.find().sort({ createdAt: -1 }).limit(200),
    VisitorLog.countDocuments(),
  ]);

  const byCountry = {};
  const byCity    = {};
  logs.forEach(v => {
    if (v.country) byCountry[v.country] = (byCountry[v.country] || 0) + 1;
    if (v.city)    byCity[v.city]        = (byCity[v.city]        || 0) + 1;
  });

  return success(res, {
    total,
    recent: logs.slice(0, 50),
    byCountry: Object.entries(byCountry).sort((a, b) => b[1] - a[1]).slice(0, 20),
    byCity:    Object.entries(byCity).sort((a, b) => b[1] - a[1]).slice(0, 20),
  });
};

// POST /api/v1/ip/geocode
exports.geocode = async (req, res) => {
  const { lat, lon } = req.body;
  if (!lat || !lon) {
    return res.status(400).json({ success: false, message: 'Cần truyền lat và lon' });
  }
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=vi&zoom=16`,
      { headers: { 'User-Agent': 'TiengHanMega/1.0' }, signal: AbortSignal.timeout(6000) }
    );
    const data = await r.json();
    const a = data.address || {};
    return res.json({
      success: true,
      data: {
        lat: parseFloat(lat), lon: parseFloat(lon),
        displayName: data.display_name || null,
        ward:        a.suburb || a.quarter || a.neighbourhood || null,
        district:    a.city_district || a.county || a.town || null,
        city:        a.city || a.state_district || a.state || null,
        country:     a.country || null,
        countryCode: a.country_code?.toUpperCase() || null,
        raw: a,
      },
    });
  } catch {
    return res.status(502).json({ success: false, message: 'Không thể lấy thông tin địa chỉ' });
  }
};
