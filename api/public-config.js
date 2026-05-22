const { json, methodNotAllowed, serverError } = require('../../lib/http');
const { publicConfig } = require('../../lib/env');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(req, res, ['GET']);

  try {
    return json(res, 200, publicConfig());
  } catch (error) {
    return serverError(res, error);
  }
};
