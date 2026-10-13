export function errorHandler(err, req, res, next) {
  console.error(`[API Error] ${err.stack || err.message}`);

  if (err.name === 'MulterError') {
    return res.status(400).json({
      success: false,
      error: `File upload error: ${err.message}`
    });
  }

  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal server error occurred.'
  });
}
