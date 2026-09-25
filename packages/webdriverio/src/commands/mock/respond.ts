/**
 * Always respond with same overwrite.
 *
 * With WebDriver BiDi, Chromium fetches the real response by default, then
 * replaces its body. Set `fetchResponse: false` to provide the response before
 * sending the request instead.
 *
 * Firefox can only provide a response body before the request is sent, so its
 * BiDi default is `fetchResponse: false`. The request does not reach the server
 * and the mock cannot inherit the server's status or response headers; specify
 * `statusCode` and `headers` explicitly when needed. Firefox rejects an explicit
 * `fetchResponse: true`. Request-stage response mocking also rejects response
 * filters (`statusCode` and `responseHeaders`) and a `statusCode` function,
 * because the real response is unavailable. Combining request overwrites with
 * request-stage responses is not supported either. Request method/header
 * filters and aborts remain supported.
 *
 * <example>
    :respond.js
    it('should demonstrate response overwrite with static data', async () => {
        const mock = await browser.mock('https://todo-backend-express-knex.herokuapp.com/', {
            method: 'get'
        })

        mock.respond([{
            title: 'Injected (non) completed Todo',
            order: null,
            completed: false
        }, {
            title: 'Injected completed Todo',
            order: null,
            completed: true
        }], {
            statusCode: 200,
            fetchResponse: true // default
        })

        await browser.url('https://todobackend.com/client/index.html?https://todo-backend-express-knex.herokuapp.com/')

        await $('#todo-list li').waitForExist()
        console.log(await $$('#todo-list li').map(el => el.getText()))
        // outputs: "[ 'Injected (non) completed Todo', 'Injected completed Todo' ]"
    })

    it('should demonstrate response overwrite with dynamic data', async () => {
        const mock = await browser.mock('https://todo-backend-express-knex.herokuapp.com/')

        mock.respond((request) => {
            if (request.body.username === 'test') {
                return { ...request.body, foo: 'bar' }
            }
            return request.body
        }, {
            statusCode: () => 200,
            headers: () => ({ foo: 'bar }),
            fetchResponse: false // do not fetch real response
        })
    })
 * </example>
 *
 * @alias mock.respond
 * @param {MockOverwrite}       overwrites              payload to overwrite the response
 * @param {MockResponseParams=} params                  additional respond parameters to overwrite
 * @param {Object=}             params.header           overwrite specific headers
 * @param {Number=}             params.statusCode       overwrite response status code
 * @param {Boolean=}            params.fetchResponse    fetch real response before responding with mocked data
 */
// actual implementation is located in packages/webdriverio/src/utils/interception
