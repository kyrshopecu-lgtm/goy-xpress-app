const baseHandler = require('../server/server-v6');
const {wrap} = require('../server/admin-clients');

module.exports = wrap(baseHandler);
