const baseHandler = require('../server/server-v6');
const {wrap:wrapClients} = require('../server/admin-clients');
const {wrap:wrapManagement} = require('../server/admin-management');
const {wrap:wrapCourierProfile} = require('../server/courier-profile');
const courierOtp = require('../server/courierOtp');

const appHandler = wrapCourierProfile(wrapManagement(wrapClients(baseHandler)));

module.exports = async function consolidatedApiHandler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const path = url.pathname.replace(/\/$/, '') || '/';

  if (path === '/api/courier/otp/request') return courierOtp.requestOtp(req, res);
  if (path === '/api/courier/otp/verify') return courierOtp.verifyOtp(req, res);

  return appHandler(req, res);
};
