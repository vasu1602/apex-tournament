let lastEvent = null;

module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'POST') {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) {}
    }
    if (body) {
      lastEvent = {
        id: Date.now() + '_' + Math.random().toString(36).substr(2, 4),
        payload: body,
        timestamp: Date.now()
      };
    }
    return res.status(200).json({ success: true });
  }

  return res.status(200).json({ success: true, event: lastEvent });
};
