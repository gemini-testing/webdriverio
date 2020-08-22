'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _stringify = require('babel-runtime/core-js/json/stringify');

var _stringify2 = _interopRequireDefault(_stringify);

var _keys = require('babel-runtime/core-js/object/keys');

var _keys2 = _interopRequireDefault(_keys);

var _constants = require('../helpers/constants');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var getCommandDataFromRequest = function getCommandDataFromRequest(fullRequestOptions) {
    var cmdNameRes = fullRequestOptions.uri.path.match(_constants.REG_EXPS.command) || [];
    var cmdName = cmdNameRes[1] || fullRequestOptions.uri.path;

    var result = function result(data) {
        return { cmdName, cmdData: data || '' };
    };

    var cmdJson = fullRequestOptions.json;


    if (typeof cmdJson !== 'object') {
        return result();
    }

    var script = cmdJson.script,
        value = cmdJson.value;


    if (script) {
        var scriptRes = script.match(_constants.REG_EXPS.executeFunction) || [];

        return result(scriptRes[1] || script);
    }

    if (value) {
        return result(Array.isArray(value) ? value.join('') : value);
    }

    var res = void 0;

    // do not fail if json contains circular refs
    try {
        res = (0, _keys2.default)(cmdJson).length ? (0, _stringify2.default)(cmdJson) : '';
    } catch (e) {}

    return result(res);
};

exports.default = getCommandDataFromRequest;
module.exports = exports['default'];