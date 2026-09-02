const baseHandler = require('../server/server-v6');
const {wrap:wrapClients} = require('../server/admin-clients');
const {wrap:wrapManagement} = require('../server/admin-management');
const {wrap:wrapCourierProfile} = require('../server/courier-profile');

module.exports = wrapCourierProfile(wrapManagement(wrapClients(baseHandler)));
