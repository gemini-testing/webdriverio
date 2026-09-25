# Puppeteer 20.9.0 → 25.10.0: проверка совместимости

## Вывод

**Это не обновление только Node.js и не полностью прозрачная замена.** В текущем Testplane обнаружены реальные вызовы удалённых API. Для изоляции контекстов добавлен ограниченный адаптер в форке. Отказ от Firefox через CDP согласован; совместимость произвольного пользовательского Puppeteer-кода по-прежнему не заявляется.

По состоянию на 2026-09-08 свежий production consumer имеет audit 0, но этого недостаточно для разрешения бесшовного выпуска.

## Существенные изменения по major-версиям

| Переход | Изменение | Влияние на этот форк и потребителей |
|---|---|---|
| 20 → 21 | Callback фильтрации targets получает Target | Форк не задаёт такой callback; важен для пользовательского прямого connect/launch. [Release 21](https://github.com/puppeteer/puppeteer/releases/tag/puppeteer-core-v21.0.0). |
| 21 → 22 | `createIncognitoBrowserContext` переименован; удалены `$x`, `waitForXPath`, `waitForTimeout`; сменились exports devices/network conditions и event listener API | Изоляция Testplane действительно вызывает старое имя контекста. Этот вызов восстановлен адаптером. Page-методы и все прежние exports не восстанавливаются. [Release 22](https://github.com/puppeteer/puppeteer/releases/tag/puppeteer-core-v22.0.0). |
| 21 → 22 | Новый headless по умолчанию, ReadableStream для PDF stream, изменения element screenshot/доступности PDF | Форк в getPuppeteer подключается к уже запущенному браузеру, а не вызывает Puppeteer.launch. Пользовательские screenshot/PDF-сценарии могут отличаться. [Release 22](https://github.com/puppeteer/puppeteer/releases/tag/puppeteer-core-v22.0.0). |
| 22 → 23 | Удалён `BrowserContext.isIncognito`; бинарный API типизирован как Uint8Array; переименованы ignoreHTTPSErrors/product; Firefox по умолчанию использует BiDi | `isIncognito` действительно используется в Testplane и восстановлен через публичный context.id. Изменение binary-контракта остаётся: в наших CDP-прогонах screenshot по-прежнему был Buffer, что не гарантирует Buffer для всех API/бэкендов. [Release 23](https://github.com/puppeteer/puppeteer/releases/tag/puppeteer-core-v23.0.0). |
| 23 → 24 | Удалена поддержка Firefox через CDP; удалены deprecated connect/launch options; HTTPRequest/Response URL включает fragment | Отказ от Firefox/CDP согласован. Это не удаление Firefox вообще или CDP для Chromium. [Release 24](https://github.com/puppeteer/puppeteer/releases/tag/puppeteer-core-v24.0.0). |
| 24 → 25 | ESM-only; новый минимум Node; удалён Browser.isConnected; executablePath/defaultArgs стали async; изменены cookie/clickCount/header API | CJS-входы проверены на Node 22.12/22/24; внутренний код использует connected, а старый isConnected возвращён адаптером. Остальные публичные изменения не маскируются. [Release 25](https://github.com/puppeteer/puppeteer/releases/tag/puppeteer-core-v25.0.0). |

Это перечень влияющих на совместимость областей, не полный changelog каждого patch-релиза. Полная история: [официальный changelog](https://github.com/puppeteer/puppeteer/blob/main/packages/puppeteer-core/CHANGELOG.md).

## Что обнаружено в потребителе и исправлено

Read-only исследование соседнего Testplane выявило `_performBidiIsolation`: он вызывает `createIncognitoBrowserContext()`, открывает страницу, сопоставляет `page.target()._targetId` с WebDriver window handle, затем различает контексты через `isIncognito()`.

Добавлен адаптер, который сохраняет объект Browser и объекты BrowserContext, не меняет глобальные прототипы и устанавливается один раз:

- `createIncognitoBrowserContext(options)` делегирует `createBrowserContext(options)`;
- `isIncognito()` возвращает наличие context.id, как старый CDP BrowserContext;
- `isConnected()` возвращает текущее browser.connected;
- контексты из browserContexts/defaultBrowserContext/createBrowserContext получают старый метод;
- декларации getPuppeteer сохраняют эти методы для TypeScript-потребителя.

Новые unit tests сначала упали без адаптера и прошли после его добавления. Настоящий browser smoke проверяет не только наличие методов, но и cookies isolation, target/window mapping, возврат в исходное окно, mock/throttle/reload.

Соседний Testplane не изменялся. Собственные тесты пользователей могут обращаться к другим удалённым Puppeteer-методам — адаптер не означает полной эмуляции версии 20.

## Наблюдаемые результаты

| Проверка | До | После |
|---|---|---|
| Clean npm consumer audit | 12 high | 0 |
| Raw Puppeteer context isolation API на Chrome 115/152 | PASS, 20.9.0 | FAIL, 25.10.0 без адаптера |
| Context isolation через getPuppeteer форка на Chrome 115/152 | Старый API присутствовал | PASS с адаптером |
| CDP connect, pages/evaluate/CDPSession на Chrome 115/152 | PASS | PASS |
| Cookies isolation, target/window mapping, CDP mock/restore, throttle, reload | Не используется как доказательство полного старого baseline | PASS на исправленных пакетах |
| CJS/ESM и isolation smoke, Node 22.12.0 / 22.21.1 / 24.19.0 | — | PASS |
| BiDi `mock('**/api')` | FAIL: возвращается исходный ответ | PASS после отдельного исправления BiDi routing и подписок |
| Полный unit suite монорепозитория после сборки | 134 failed suites / 412 failed tests | 305 passed suites / 3478 passed tests; 1 suite и 13 tests уже были skipped |

Firefox 128 проверялся отдельным CDP-процессом: соединение устанавливается обоими клиентами, но полный сценарий не проходит. У 20 также есть ошибки navigation/evaluate; у 25 блокируется получение страницы. Поэтому старый Firefox/CDP не объявляется ни полностью рабочим baseline, ни совместимым после обновления.

## Почему не ограничиться Puppeteer 24

Проверены npm-метаданные последней 24-й версии: `puppeteer-core@24.43.1` зависит от `@puppeteer/browsers@2.13.2`. Эта ветка содержит extract-zip; простое обновление до 24 не устраняет всю уязвимую цепочку. Корневой override не является исправлением распространяемого npm-пакета, потому что не наследуется приложением-потребителем.

## Согласованное изменение

- Отказ от Firefox через CDP принят пользователем: сам Firefox удалил CDP в версии 141 ([Mozilla release notes](https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/141)). Firefox остаётся поддерживаемым через WebDriver/BiDi, Chromium — через CDP. Восстанавливать старый Firefox/CDP не требуется; этот пункт больше не блокирует обновление.

## Не закрыто

- Пользовательские `$x`/waitForXPath/waitForTimeout, PDF/stream/screenshot и прямые Puppeteer imports: необходим аудит используемого API либо breaking migration.
- Удалённые Selenium/Selenoid/Moon, авторизация, корпоративные прокси/TLS и Linux/Windows: живое окружение не проверялось.
- Полная Testplane CI-матрица с Linux grid остаётся не проверенной локально. Совместная проверка изменённых Testplane/WDIO и контроль на настоящем master выполнены 2026-09-11; результаты ниже.

Публикация не выполнялась. Считать ветку безусловно безопасным бесшовным релизом для всех нынешних пользователей нельзя.

## Дополнительные исправления по запросу о тестах всего монорепозитория

- BiDi: wildcard-компоненты не передаются как буквальные URL в `network.addIntercept`; полная фильтрация выполняется локально. Неподходящие запросы продолжаются, пересекающиеся перехваты обрабатываются ровно одним mock; подписки привязаны к сессии, а не к глобальному флагу.
- Browser HTTP transport: `ky` 0.33.3 вместо 0.33.0 для native Request на Node 22; корректная передача timeout, один уровень retries и URL независимо от JS realm. Node/got остаётся транспортом по умолчанию.
- Devtools: нулевой implicit timeout больше не запускает ожидание селектора с таймаутом Puppeteer по умолчанию.
- `click({ duration })`: явно заданная задержка удержания теперь выполняется; обычный клик по-прежнему не получает лишнего pause(0).
- Внутренний `SESSION_BIDI_MOCKS` исключён из публичного списка команд; stacktrace filtering учитывает имена форков.
- Тестовые фикстуры обновлены под имена форков и реальные Request/Response. Старые тесты удалённых request-классов перенесены на публичные makeRequest/error helpers с проверками тела, headers, auth, transforms, событий, retries и 429.
- Сохранено намеренное поведение форка: legacy DOM visibility script и boolean-параметр getHTML; не восстановлены автоматически механизмы upstream v9, ранее отключённые в этом репозитории.
- Цепочка `$$()[index]` ожидает появления нужного индекса в пределах waitforTimeout; повторяется исходный запрос со всеми аргументами, включая React filters и custom selector options. Для уже найденного индекса дополнительные запросы не выполняются.
- Lighthouse выбирает target типа `page`, затем CDP endpoint по публичному `Target.getTargetInfo`, а не первому элементу `/json/list` или приватному frame id. Binary trace разбирается через Buffer.from(Uint8Array). Реальные локальные PWA, tracing и performance audits проходят.
- BrowserFramework повторяет polling при transient execution-context reset и связывает результат с конкретным spec; остальные ошибки завершают spec с ошибкой, а не уходят в unhandled rejection.
- Shadow roots регистрируются после подключения host с parent-before-child порядком, включая обычные detached hosts и native/declarative roots. Ожидающие hosts хранятся через WeakRef, чтобы не удерживать detached DOM.
- Session managers снимают те же callback, которые подписали, и очищаются при deleteSession; чужие listeners сохраняются. Неуспешный switchWindow восстанавливает исходное окно, context обновляется только после успешной команды. closeWindow по-прежнему не переключает окно автоматически.
- Проверка необработанных ошибок Vitest больше не отключена.

Эти исправления шире исходного обновления зависимостей. Их нужно просматривать отдельно от security diff. Подробные зелёные локальные smoke/component/E2E результаты и ограничения приведены в TEST-RESULTS.md. Они не заменяют облачную, кроссплатформенную и полную Testplane-интеграционную проверку.

## Optional Devtools package: 2026-09-11

Отдельная проверка consumer с явно установленным `@testplane/devtools` обнаружила оставшийся runtime `puppeteer-core@20.9.0`: audit этого consumer показал 9 уязвимостей, хотя consumer без optional Devtools уже проходил. Поэтому проверка только обязательного дерева Testplane недостаточна для вывода обо всех распространяемых WDIO-пакетах.

В `@testplane/devtools` runtime обновлён до `^25.10.0`, минимум Node — `>=22.12.0`. Перенесены импорты на поддерживаемые exports, `ignoreHTTPSErrors` переводится в `acceptInsecureCerts`, Chromium/Edge используют современный selector `browser`, двойной клик — `Mouse.click({ count: 2 })`. Генерация UUID v4 для session/window IDs использует встроенный `crypto.randomUUID`; runtime `uuid` и его types удалены после того, как повторный optional audit выявил оставшуюся уязвимость этой зависимости. CJS-вход использует асинхронный ESM bridge, поскольку зависимость `@testplane/wdio-config` не предоставляет require-вход. Firefox/CDP отклоняется явно до запуска браузера и исключён из `SUPPORTED_BROWSER`; это не отменяет поддержку Firefox через WebDriver BiDi.

На Node 22.21.1 и Chrome 152.0.7977.82 отдельный настоящий Devtools smoke проверил навигацию/title, CSS/XPath/shadow selectors, ввод/keyboard actions, DOM-событие double-click, cookies add/read/delete, iframe, создание/переключение/закрытие окна, PNG screenshot/reload и завершение сессии. Команды проверяются отдельно от Testplane: Testplane 9 не разрешает Devtools как automation backend. Доказательства и команды находятся в `vibe/release-readiness/devtools/`.

Ограничение логирования: Puppeteer 25 больше не использует пакет `debug`, поэтому прежний `patchDebug` не перенаправляет CDP protocol logs в WDIO logger. В строгом workspace он предупреждает об отсутствующем `debug`; наличие транзитивного `debug` в consumer может скрыть это предупреждение, но не восстанавливает protocol logging. Диагностика самого Puppeteer доступна через `NODE_DEBUG=puppeteer:*`; прозрачное сохранение прежнего logging API не заявляется. Пользовательские прямые Puppeteer API по-прежнему требуют собственного аудита. Финальный audit optional consumer необходимо проверять по свежему `pack-consumer.mjs --with-devtools`, а не переносить результат consumer без Devtools.

Финальная проверка optional consumer `testplane-release-consumer-hCkj2F`: production audit **0**, `npm ls --all --omit=dev` проходит, установленные build-файлы совпадают с локальными tarball preview, нет overrides и package symlinks. Настоящий Devtools smoke из установленного consumer прошёл **36/36** проверок: ESM и холодный CJS на Node 22.21.1 и минимальном Node 22.12.0, Chrome 152.0.7977.82 и Puppeteer 25.10.0. Полный package unit suite — **118/118**, package ESLint и ESM/CJS/declaration build проходят. Локальные пути и JSON-результаты сохранены в `vibe/release-readiness/devtools/consumer-summary.json`; эти результаты не заменяют проверку удалённых browser providers.

## Совместная проверка с Testplane, 2026-09-11

Проверены обе изменённые ветки одновременно, а для атрибуции ошибок — четыре независимые комбинации настоящего Testplane master/PR и старого/замороженного нового WDIO. У каждого Testplane собственные lockfile, npm ci и build; проверены реальные загруженные модули. REPL-регрессия относилась к Testplane PR: master проходил с обеими версиями WDIO, PR падал с обеими. Исправлена последовательность preload WDIO/Mocha, сохранены исходные тесты с конфликтующим loader; REPL 5/5 проходит на Node 22.12.0, 22.21.1 и 24.19.0.

После дополнительных исправлений cookies partition, диалогов, preload lifecycle и BiDi network errors чистая установка Testplane из локальных tarballs с восемью обязательными WDIO-пакетами имеет production audit **0**, валидное dependency tree и проходит **35/35** Chrome/Firefox сценариев как на Node 22.21.1, так и на минимальном 22.12.0. Это не linked-only проверка: package symlinks, devDependencies и корневые overrides отсутствуют, пути master/worker и содержимое build проверены. Во временных manifest только ссылки на неопубликованные first-party пакеты заменены на tarballs; выбор новых release-версий и обновление зависимостей Testplane остаются отдельным шагом выпуска.

Firefox body mocking теперь выполняется до отправки запроса: по умолчанию сервер не вызывается и его status/headers не наследуются. Явный `fetchResponse: true` для Firefox и response-зависимые фильтры при ранней подмене отклоняются с объяснением. Chromium сохраняет прежнее поведение по умолчанию; ранняя подмена доступна через `fetchResponse: false`. Поздняя ошибка протокольного fulfillment не считается успешным вызовом и доступна через `waitForResponse`/`restore`. Это существенная граница совместимости, не просто повышение версии Node.

Финальные WDIO unit: **3540 passed / 13 existing skipped**; локальные testrunner, Classic, multiremote, standalone, reloadSession и Chrome/Firefox launch/BiDi завершаются успешно. Testplane unit: **3462 passed / 1 existing pending**, выбранные integration-наборы **40/40**. Весь Testplane репозиторий зелёным не объявляется: Linux-grid E2E не получили браузер в локальном окружении; пять screenshot integration и 50 browser-env failures воспроизведены на baseline без изменения эталонов. Установленный production dependency graph проверен свежим npm audit, но отдельная актуальная проверка всех сторонних пакетов внутри runtime-бандла пока ожидает разрешения на отправку их имён/версий в npm. Полный локальный отчёт и воспроизводимые команды сохранены в untracked `vibe/release-readiness/README.md`.
