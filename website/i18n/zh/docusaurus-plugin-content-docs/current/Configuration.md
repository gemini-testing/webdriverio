---
id: configuration
title: 配置
---

Based on the [setup type](setuptypes) (e.g. using the raw protocol bindings, WebdriverIO as standalone package or the WDIO testrunner) there is a different set of options available to control the environment.

## WebDriver 选项

[`webdriver`](https://www.npmjs.com/package/webdriver) 协议包提供以下选项：

### protocol

与驱动服务器交流时使用的协议。

Type: `String`<br /> Default: `http`

### hostname

驱动服务器主机。

Type: `String`<br /> Default: `localhost`

### port

驱动服务器监听端口。

Type: `Number`<br /> Default: `4444`

### path

驱动服务器端点路径。

Type: `String`<br /> Default: `/`

### queryParams

Query parameters that are propagated to the driver server.

Type: `Object`<br /> Default: `null`

### user

Your cloud service username (only works for [Sauce Labs](https://saucelabs.com), [Browserstack](https://www.browserstack.com), [TestingBot](https://testingbot.com), [CrossBrowserTesting](https://crossbrowsertesting.com) or [LambdaTest](https://www.lambdatest.com) accounts). If set, WebdriverIO will automatically set connection options for you. If you don't use a cloud provider this can be used to authenticate any other WebDriver backend. If set, WebdriverIO will automatically set connection options for you. If you don't use a cloud provider this can be used to authenticate any other WebDriver backend.

Type: `String`<br /> Default: `null`

### key

Your cloud service access key or secret key (only works for [Sauce Labs](https://saucelabs.com), [Browserstack](https://www.browserstack.com), [TestingBot](https://testingbot.com), [CrossBrowserTesting](https://crossbrowsertesting.com) or [LambdaTest](https://www.lambdatest.com) accounts). If set, WebdriverIO will automatically set connection options for you. If you don't use a cloud provider this can be used to authenticate any other WebDriver backend. If set, WebdriverIO will automatically set connection options for you. If you don't use a cloud provider this can be used to authenticate any other WebDriver backend.

Type: `String`<br /> Default: `null`

### capabilities

Defines the capabilities you want to run in your WebDriver session. Check out the [WebDriver Protocol](https://w3c.github.io/webdriver/#capabilities) for more details. Defines the capabilities you want to run in your WebDriver session. Check out the [WebDriver Protocol](https://w3c.github.io/webdriver/#capabilities) for more details. If you run an older driver that doesn't support the WebDriver protocol, you’ll need to use the [JSONWireProtocol capabilities](https://github.com/SeleniumHQ/selenium/wiki/DesiredCapabilities) to successfully run a session.

Next to the WebDriver based capabilities you can apply browser and vendor specific options that allow deeper configuration to the remote browser or device. These are documented in the corresponding vendor docs, e.g.: These are documented in the corresponding vendor docs, e.g.:

- `goog:chromeOptions`: for [Google Chrome](https://chromedriver.chromium.org/capabilities#h.p_ID_106)
- `moz:firefoxOptions`: for [Mozilla Firefox](https://firefox-source-docs.mozilla.org/testing/geckodriver/Capabilities.html)
- `ms:edgeOptions`: for [Microsoft Edge](https://docs.microsoft.com/en-us/microsoft-edge/webdriver-chromium/capabilities-edge-options#using-the-edgeoptions-class)
- `sauce:options`: for [Sauce Labs](https://docs.saucelabs.com/dev/test-configuration-options/#desktop-and-mobile-capabilities-sauce-specific--optional)
- `bstack:options`: for [BrowserStack](https://www.browserstack.com/automate/capabilities?tag=selenium-4#)
- `selenoid:options`: for [Selenoid](https://github.com/aerokube/selenoid/blob/master/docs/special-capabilities.adoc)

Additionally, a useful utility is the Sauce Labs [Automated Test Configurator](https://wiki.saucelabs.com/display/DOCS/Platform+Configurator#/), which helps you create this object by clicking together your desired capabilities.

Type: `Object`<br /> Default: `null`

**Example:**

```js
{
    browserName: 'chrome', // options: `firefox`, `chrome`, `opera`, `safari`
    browserVersion: '27.0', // browser version
    platformName: 'Windows 10' // OS platform
}
```

If you’re running web or native tests on mobile devices, `capabilities` differs from the WebDriver protocol. See the [Appium Docs](https://appium.github.io/appium.io/docs/en/writing-running-appium/caps/) for more details. See the [Appium Docs](https://appium.github.io/appium.io/docs/en/writing-running-appium/caps/) for more details.

### logLevel

Level of logging verbosity.

Type: `String`<br /> Default: `info`<br /> Options: `trace` | `debug` | `info` | `warn` | `error` | `silent`

### outputDir

Directory to store all testrunner log files (including reporter logs and `wdio` logs). If not set, all logs are streamed to `stdout`. Since most reporters are made to log to `stdout`, it is recommended to only use this option for specific reporters where it makes more sense to push report into a file (like the `junit` reporter, for example). If not set, all logs are streamed to `stdout`. Since most reporters are made to log to `stdout`, it is recommended to only use this option for specific reporters where it makes more sense to push report into a file (like the `junit` reporter, for example).

When running in standalone mode, the only log generated by WebdriverIO will be the `wdio` log.

Type: `String`<br /> Default: `null`

### connectionRetryTimeout

Timeout for any WebDriver request to a driver or grid.

Type: `Number`<br /> Default: `120000`

### connectionRetryCount

Maximum count of request retries to the Selenium server.

Type: `Number`<br /> Default: `3`

### agent

Allows you to use a custom`http`/`https`/`http2` [agent](https://www.npmjs.com/package/got#agent) to make requests.

Type: `Object`<br /> Default:

```js
{
    http: new http.Agent({ keepAlive: true }),
    https: new https.Agent({ keepAlive: true })
}
```

### headers

Specify custom `headers` to pass into every WebDriver request and when connect to browser through Puppeteer using CDP protocol.

:::caution

These headers __aren't__ passed into browser request. These headers __aren't__ passed into browser request. If you are looking for modifying request headers of browser requests, please get involved in [#6361](https://github.com/webdriverio/webdriverio/issues/6361)!

:::

Type: `Object`<br /> Default: `{}`

### transformRequest

Function intercepting [HTTP request options](https://github.com/sindresorhus/got#options) before a WebDriver request is made

Type: `(RequestOptions) => RequestOptions`<br /> Default: *none*

### transformResponse

Function intercepting HTTP response objects after a WebDriver response has arrived. The function is passed the original response object as the first and the corresponding `RequestOptions` as the second argument. The function is passed the original response object as the first and the corresponding `RequestOptions` as the second argument.

Type: `(Response, RequestOptions) => Response`<br /> Default: *none*

### strictSSL

Whether it does not require SSL certificate to be valid. Whether it does not require SSL certificate to be valid. It can be set via an environment variables as `STRICT_SSL` or `strict_ssl`.

Type: `Boolean`<br /> Default: `true`

### enableDirectConnect

Whether enable [Appium direct connection feature](https://appiumpro.com/editions/86-connecting-directly-to-appium-hosts-in-distributed-environments). It does nothing if the response did not have proper keys while the flag is enabled. It does nothing if the response did not have proper keys while the flag is enabled.

Type: `Boolean`<br /> Default: `true`

---

## WebdriverIO

The following options (including the ones listed above) can be used with WebdriverIO in standalone:

### automationProtocol

Define the protocol you want to use for your browser automation. Define the protocol you want to use for your browser automation. Currently only [`webdriver`](https://www.npmjs.com/package/webdriver) and [`devtools`](https://www.npmjs.com/package/devtools) are supported, as these are the main browser automation technologies available.

If you want to automate the browser using `devtools`, make sure you have the NPM package installed (`$ npm install --save-dev devtools`).

Type: `String`<br /> Default: `webdriver`

### baseUrl

Shorten `url` command calls by setting a base URL.
- If your `url` parameter starts with `/`, then `baseUrl` is prepended (except the `baseUrl` path, if it has one).
- If your `url` parameter starts without a scheme or `/` (like `some/path`), then the full `baseUrl` is prepended directly.

Type: `String`<br /> Default: `null`

### waitforTimeout

Default timeout for all `waitFor*` commands. (Note the lowercase `f` in the option name.) Default timeout for all `waitFor*` commands. (Note the lowercase `f` in the option name.) This timeout __only__ affects commands starting with `waitFor*` and their default wait time.

To increase the timeout for a _test_, please see the framework docs.

Type: `Number`<br /> Default: `3000`

### waitforInterval

Default interval for all `waitFor*` commands to check if an expected state (e.g., visibility) has been changed.

Type: `Number`<br /> Default: `500`

### region

If running on Sauce Labs, you can choose to run tests between different datacenters: US or EU. To change your region to EU, add `region: 'eu'` to your config. To change your region to EU, add `region: 'eu'` to your config.

__Note:__ This only has an effect if you provide `user` and `key` options that are connected to your Sauce Labs account.

Type: `String`<br /> Default: `us`

*(only for vm and or em/simulators)*

---

## Testrunner Options

The following options (including the ones listed above) are defined only for running WebdriverIO with the WDIO testrunner:

### specs

Define specs for test execution. Define specs for test execution. You can either specify a glob pattern to match multiple files at once or wrap a glob or set of paths into an array to run them within a single worker process. All paths are seen as relative from the config file path. All paths are seen as relative from the config file path.

Type: `(String | String[])[]`<br /> Default: `[]`

### exclude

Exclude specs from test execution. Exclude specs from test execution. All paths are seen as relative from the config file path.

Type: `String[]`<br /> Default: `[]`

### suites

An object describing various of suites, which you can then specify with the `--suite` option on the `wdio` CLI.

Type: `Object`<br /> Default: `{}`

### capabilities

The same as the `capabilities` section described above, except with the option to specify either a [`multiremote`](multiremote) object, or multiple WebDriver sessions in an array for parallel execution.

You can apply the same vendor and browser specific capabilities as defined [above](/docs/configuration#capabilities).

Type: `Object`|`Object[]`<br /> Default: `[{ maxInstances: 5, browserName: 'firefox' }]`

### maxInstances

Maximum number of total parallel running workers.

__Note:__ that it may be a number as high as `100`, when the tests are being performed on some external vendors such as Sauce Labs's machines. There, the tests are not tested on a single machine, but rather, on multiple VMs. If the tests are to be run on a local development machine, use a number that is more reasonable, such as `3`, `4`, or `5`. Essentially, this is the number of browsers that will be concurrently started and running your tests at the same time, so it depends on how much RAM there is on your machine, and how many other apps are running on your machine. There, the tests are not tested on a single machine, but rather, on multiple VMs. If the tests are to be run on a local development machine, use a number that is more reasonable, such as `3`, `4`, or `5`. Essentially, this is the number of browsers that will be concurrently started and running your tests at the same time, so it depends on how much RAM there is on your machine, and how many other apps are running on your machine.

Type: `Number`<br /> Default: `100`

### maxInstancesPerCapability

Maximum number of total parallel running workers per capability.

Type: `Number`<br /> Default: `100`

### injectGlobals

Inserts WebdriverIO's globals (e.g. `browser`, `$` and `$$`) into the global environment. If you set to `false`, you should import from `@wdio/globals`, e.g.: If you set to `false`, you should import from `@wdio/globals`, e.g.:

```ts
import { browser, $, $$, expect } from '@wdio/globals'
```

Note: WebdriverIO doesn't handle injection of test framework specific globals.

Type: `Boolean`<br /> Default: `true`

### bail

If you want your test run to stop after a specific number of test failures, use `bail`. (It defaults to `0`, which runs all tests no matter what.) **Note:** Please be aware that when using a third party test runner (such as Mocha), additional configuration might be required. (It defaults to `0`, which runs all tests no matter what.) **Note:** Please be aware that when using a third party test runner (such as Mocha), additional configuration might be required.

Type: `Number`<br /> Default: `0` (don't bail; run all tests)

### specFileRetries

The number of times to retry an entire specfile when it fails as a whole.

Type: `Number`<br /> Default: `0`

### specFileRetriesDelay

Delay in seconds between the spec file retry attempts

Type: `Number`<br /> Default: `0`

### specFileRetriesDeferred

Whether or not retried specfiles should be retried immediately or deferred to the end of the queue.

Type: `Boolean`<br /> Default: `true`

### services

Services take over a specific job you don't want to take care of. They enhance your test setup with almost no effort. They enhance your test setup with almost no effort.

Type: `String[]|Object[]`<br /> Default: `[]`

### framework

Defines the test framework to be used by the WDIO testrunner.

Type: `String`<br /> Default: `mocha`<br /> Options: `mocha` | `jasmine`

### mochaOpts, jasmineOpts and cucumberOpts


Specific framework-related options. Specific framework-related options. See the framework adapter documentation on which options are available. Read more on this in [Frameworks](frameworks). Read more on this in [Frameworks](frameworks).

Type: `Object`<br /> Default: `{ timeout: 10000 }`

### cucumberFeaturesWithLineNumbers

List of cucumber features with line numbers (when [using cucumber framework](./Frameworks.md#using-cucumber)).

Type: `String[]` Default: `[]`

### reporters

List of reporters to use. List of reporters to use. A reporter can be either a string, or an array of `['reporterName', { /* reporter options */}]` where the first element is a string with the reporter name and the second element an object with reporter options.

Type: `String[]|Object[]`<br /> Default: `[]`

Example:

```js
reporters: [
    'dot',
    'spec'
    ['junit', {
        outputDir: `${__dirname}/reports`,
        otherOption: 'foobar'
    }]
]
```

### reporterSyncInterval

Determines in which interval the reporter should check if they are synchronized if they report their logs asynchronously (e.g. if logs are streamed to a 3rd party vendor).

Type: `Number`<br /> Default: `100` (ms)

### reporterSyncTimeout

Determines the maximum time reporters have to finish uploading all their logs until an error is being thrown by the testrunner.

Type: `Number`<br /> Default: `5000` (ms)

### execArgv

Node arguments to specify when launching child processes.

Type: `String[]`<br /> Default: `null`

### filesToWatch

A list of glob supporting string patterns that tell the testrunner to have it additionally watch other files, e.g. application files, when running it with the `--watch` flag. By default the testrunner already watches all spec files. By default the testrunner already watches all spec files.

Type: `String[]`<br /> Default: `[]`

### autoCompileOpts

Compiler options when using WebdriverIO with TypeScript or Babel.

#### autoCompileOpts.autoCompile

If set to `true` the WDIO testrunner will automatically try to transpile the spec files.

Type: `Boolean` Default: `true`

#### autoCompileOpts.tsNodeOpts

Configure how [`ts-node`](https://www.npmjs.com/package/ts-node) is suppose to transpile the files.

Type: `Object` Default: `{ transpileOnly: true }`

#### autoCompileOpts.babelOpts

Configure how [@babel/register](https://www.npmjs.com/package/@babel/register) is suppose to transpile the files.

Type: `Object` Default: `{}`

## Hooks

The WDIO testrunner allows you to set hooks to be triggered at specific times of the test lifecycle. This allows custom actions (e.g. take screenshot if a test fails). This allows custom actions (e.g. take screenshot if a test fails).

Every hook has as parameter specific information about the lifecycle (e.g. information about the test suite or test). Every hook has as parameter specific information about the lifecycle (e.g. information about the test suite or test). Read more about all hook properties in [our example config](https://github.com/webdriverio/webdriverio/blob/master/examples/wdio.conf.js#L183-L326).

**Note:** Some hooks (`onPrepare`, `onWorkerStart`, `onWorkerEnd` and `onComplete`) are executed in a different process and therefore can not share any global data with the other hooks that live in the worker process.

### onPrepare

Gets executed once before all workers get launched.

Parameters:

- `config` (`object`): WebdriverIO configuration object
- `param` (`object[]`): list of capabilities details

### onWorkerStart

Gets executed before a worker process is spawned and can be used to initialize specific service for that worker as well as modify runtime environments in an async fashion.

Parameters:

- `cid` (`string`): capability id (e.g 0-0)
- `caps` (`object`): containing capabilities for session that will be spawn in the worker
- `specs` (`string[]`): specs to be run in the worker process
- `args` (`object`): object that will be merged with the main configuration once worker is initialized
- `execArgv` (`string[]`): list of string arguments passed to the worker process

### onWorkerEnd

Gets executed just after a worker process has exited.

Parameters:

- `cid` (`string`): capability id (e.g 0-0)
- `exitCode` (`number`): 0 - success, 1 - fail
- `specs` (`string[]`): specs to be run in the worker process
- `retries` (`number`): number of retries used

### beforeSession

Gets executed just before initializing the webdriver session and test framework. It allows you to manipulate configurations depending on the capability or spec. It allows you to manipulate configurations depending on the capability or spec.

Parameters:

- `config` (`object`): WebdriverIO configuration object
- `caps` (`object`): containing capabilities for session that will be spawn in the worker
- `specs` (`string[]`): specs to be run in the worker process

### before

Gets executed before test execution begins. Gets executed before test execution begins. At this point you can access to all global variables like `browser`. It is the perfect place to define custom commands. It is the perfect place to define custom commands.

Parameters:

- `caps` (`object`): containing capabilities for session that will be spawn in the worker
- `specs` (`string[]`): specs to be run in the worker process
- `browser` (`object`): instance of created browser/device session

### beforeSuite

Hook that gets executed before the suite starts

Parameters:

- `suite` (`object`): suite details

### beforeHook

Hook that gets executed *before* a hook within the suite starts (e.g. runs before calling beforeEach in Mocha)

Parameters:

- `test` (`object`): test details
- `context` (`object`): test context (represents World object in Cucumber)

### afterHook

Hook that gets executed *after* a hook within the suite ends (e.g. runs after calling afterEach in Mocha)

Parameters:

- `test` (`object`): test details
- `context` (`object`): test context (represents World object in Cucumber)
- `result` (`object`): hook result (contains `error`, `result`, `duration`, `passed`, `retries` properties)

### beforeTest

Function to be executed before a test (in Mocha/Jasmine only).

Parameters:

- `test` (`object`): test details
- `context` (`object`): scope object the test was executed with

### beforeCommand

Runs before a WebdriverIO command gets executed.

Parameters:

- `commandName` (`string`): command name
- `args` (`*`): arguments that command would receive

### afterCommand

Runs after a WebdriverIO command gets executed.

Parameters:

- `commandName` (`string`): command name
- `args` (`*`): arguments that command would receive
- `result` (`number`): 0 - command success, 1 - command error
- `error` (`Error`): error object if any

### afterTest

Function to be executed after a test (in Mocha/Jasmine) ends.

Parameters:

- `test` (`object`): test details
- `context` (`object`): scope object the test was executed with
- `result.error` (`Error`): error object in case the test fails, otherwise `undefined`
- `result.result` (`Any`): return object of test function
- `result.duration` (`Number`): duration of test
- `result.passed` (`Boolean`): true if test has passed, otherwise false
- `result.retries` (`Object`): informations to spec related retries, e.g. `{ attempts: 0, limit: 0 }`
- `result` (`object`): hook result (contains `error`, `result`, `duration`, `passed`, `retries` properties)

### afterSuite

Hook that gets executed after the suite has ended

Parameters:

- `suite` (`object`): suite details

### after

Gets executed after all tests are done. Gets executed after all tests are done. You still have access to all global variables from the test.

Parameters:

- `result` (`number`): 0 - test pass, 1 - test fail
- `caps` (`object`): containing capabilities for session that will be spawn in the worker
- `specs` (`string[]`): specs to be run in the worker process

### afterSession

Gets executed right after terminating the webdriver session.

Parameters:

- `config` (`object`): WebdriverIO configuration object
- `caps` (`object`): containing capabilities for session that will be spawn in the worker
- `specs` (`string[]`): specs to be run in the worker process

### onComplete

Gets executed after all workers got shut down and the process is about to exit. Gets executed after all workers got shut down and the process is about to exit. An error thrown in the onComplete hook will result in the test run failing.

Parameters:

- `exitCode` (`number`): 0 - success, 1 - fail
- `config` (`object`): WebdriverIO configuration object
- `caps` (`object`): containing capabilities for session that will be spawn in the worker
- `result` (`object`): results object containing test results

### onReload

Gets executed when a refresh happens.

Parameters:

- `oldSessionId` (`string`): session ID of the old session
- `newSessionId` (`string`): session ID of the new session

### beforeFeature

Runs before a Cucumber Feature.

Parameters:

- `uri` (`string`): path to feature file
- `feature` ([`GherkinDocument.IFeature`](https://github.com/cucumber/common/blob/b94ce625967581de78d0fc32d84c35b46aa5a075/json-to-messages/javascript/src/cucumber-generic/JSONSchema.ts#L8-L17)): Cucumber feature object

### afterFeature

Runs after a Cucumber Feature.

Parameters:

- `uri` (`string`): path to feature file
- `feature` ([`GherkinDocument.IFeature`](https://github.com/cucumber/common/blob/b94ce625967581de78d0fc32d84c35b46aa5a075/json-to-messages/javascript/src/cucumber-generic/JSONSchema.ts#L8-L17)): Cucumber feature object

### beforeScenario

Runs before a Cucumber Scenario.

Parameters:

- `world` ([`ITestCaseHookParameter`](https://github.com/cucumber/cucumber-js/blob/ac124f7b2be5fa54d904c7feac077a2657b19440/src/support_code_library_builder/types.ts#L10-L15)): world object containing information on pickle and test step
- `context` (`object`): Cucumber World object

### afterScenario

Runs after a Cucumber Scenario.

Parameters:

- `world` ([`ITestCaseHookParameter`](https://github.com/cucumber/cucumber-js/blob/ac124f7b2be5fa54d904c7feac077a2657b19440/src/support_code_library_builder/types.ts#L10-L15)): world object containing information on pickle and test step
- `result` (`object`): results object containing scenario results
- `result.passed` (`boolean`): true if scenario has passed
- `result.error` (`string`): error stack if scenario failed
- `result.duration` (`number`): duration of scenario in milliseconds
- `context` (`object`): Cucumber World object

### beforeStep

Runs before a Cucumber Step.

Parameters:

- `step` ([`Pickle.IPickleStep`](https://github.com/cucumber/common/blob/b94ce625967581de78d0fc32d84c35b46aa5a075/messages/jsonschema/Pickle.json#L20-L49)): Cucumber step object
- `scenario` ([`IPickle`](https://github.com/cucumber/common/blob/b94ce625967581de78d0fc32d84c35b46aa5a075/messages/jsonschema/Pickle.json#L137-L175)): Cucumber scenario object
- `context` (`object`): Cucumber World object

### afterStep

Runs after a Cucumber Step.

Parameters:

- `step` ([`Pickle.IPickleStep`](https://github.com/cucumber/common/blob/b94ce625967581de78d0fc32d84c35b46aa5a075/messages/jsonschema/Pickle.json#L20-L49)): Cucumber step object
- `scenario` ([`IPickle`](https://github.com/cucumber/common/blob/b94ce625967581de78d0fc32d84c35b46aa5a075/messages/jsonschema/Pickle.json#L137-L175)): Cucumber scenario object
- `result`: (`object`): results object containing step results
- `result.passed` (`boolean`): true if scenario has passed
- `result.error` (`string`): error stack if scenario failed
- `result.duration` (`number`): duration of scenario in milliseconds
- `context` (`object`): Cucumber World object