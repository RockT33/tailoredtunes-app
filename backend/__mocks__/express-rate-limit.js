// Mock express-rate-limit for tests — pass all requests through
module.exports = () => (req, res, next) => next();
