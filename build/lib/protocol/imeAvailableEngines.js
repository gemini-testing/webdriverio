'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = imeAvailableEngines;

var _deprecationWarning = require('../helpers/deprecationWarning');

var _deprecationWarning2 = _interopRequireDefault(_deprecationWarning);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function imeAvailableEngines() {
  (0, _deprecationWarning2.default)('imeAvailableEngines', this.options);
  return this.requestHandler.create('/session/:sessionId/ime/available_engines');
} /**
   *
   * List all available engines on the machine. To use an engine, it has to be present
   * in this list.
   *
   * This command is deprecated and will be removed soon. Make sure you don't use it in your
   * automation/test scripts anymore to avoid errors.
   *
   * @return {Object[]} engines   A list of available engines
   *
   * @see  https://github.com/SeleniumHQ/selenium/wiki/JsonWireProtocol#sessionsessionidimeavailable_engines
   * @type protocol
   * @deprecated
   *
   */

module.exports = exports['default'];