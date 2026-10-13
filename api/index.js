export default async function handler(req, res) {
  try {
    const { default: app } = await import('../src/server.js');
    return app(req, res);
  } catch (err) {
    return res.status(500).json({
      error: 'CRASH_ON_IMPORT',
      message: err.message,
      stack: err.stack
    });
  }
}
