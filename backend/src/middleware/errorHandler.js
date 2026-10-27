// Central error handler: every thrown error ends up here.
module.exports = (err, req, res, next) => {
  console.error(err.message);
  let status = err.status || 500;
  let message = err.message || 'Server error';

  if (err.code === 11000) { status = 409; message = 'That value already exists (duplicate)'; }
  if (err.name === 'ValidationError') { status = 400; }
  if (err.name === 'CastError') { status = 400; message = 'Invalid id'; }
  if (err.code === 'LIMIT_FILE_SIZE') { status = 400; message = 'File too large (max 5 MB)'; }

  res.status(status).json({ message });
};
