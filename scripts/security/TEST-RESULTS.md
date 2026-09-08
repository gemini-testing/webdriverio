# Проверки всего монорепозитория

Дата: 2026-09-08. Ветка: `sp.fix-vulnerabilities`. Локальное окружение: Node.js 22.21.1, macOS arm64.

**Локально доступные проверки исправлены и проходят. Ветка предназначена для draft PR, а не для публикации или объявления полной совместимости.** Облачные/кроссплатформенные проверки и исторически отключённые наборы перечислены отдельно. Новые skips для сокрытия ошибок не добавлялись; проверка необработанных ошибок Vitest включена.

## Подтверждённые результаты

| Команда / набор | Результат |
|---|---|
| `pnpm run compile:all:all` | PASS |
| `pnpm run test:unit:run` | 305 passed suites, 3478 passed tests; существующие 1 suite / 13 tests skipped |
| `pnpm run test:typings` | PASS |
| `pnpm run test:eslint`, `test:ejslint`, `test:depcheck` | PASS |
| `pnpm run test:interop` | PASS |
| `CI=1 pnpm run test:smoke` | PASS, финальное сообщение `All smoke tests passed!`; это framework smoke с mock service, не браузерная матрица |
| `CI=1 pnpm run test:component` | PASS: React 2, Vue 3, Svelte 2, Lit 72, Stencil 5; всего 84 passed, 1 существующий Stencil skipped; coverage thresholds и screenshot-artifact check проходят |
| `pnpm run test:e2e:testrunner` | PASS: 98 tests; основной файл 95, mock 1, Puppeteer 1, reload 1; 2 существующих source-maps skipped |
| `pnpm run test:e2e:classic` | PASS, 2 tests |
| `pnpm run test:e2e:multiremote` | PASS, 2 configurations × 2 tests; по 3 существующих skipped |
| `pnpm run test:e2e:webdriver` | PASS, только Chrome / Firefox: 9 / 8 tests; 2 / 3 существующих skipped |
| `pnpm run test:e2e:standalone` | PASS, 1 attach test |
| `pnpm exec vitest --config ./e2e/vitest.config.ts --run e2e/launch/reloadSession.test.ts` | PASS, 1 BiDi reconnect test |
| `node scripts/security/prepare.mjs` | PASS: чистый production consumer audit 0, CJS/ESM/TypeScript |
| Real-browser smoke из свежего consumer, Chrome 152, CDP / BiDi | PASS: isolation, target mapping, mock/restore, throttle, reload, повторный mock, unmatched request, disconnect |
| Тот же consumer на минимальном Node 22.12.0 | PASS: CJS/ESM imports и реальный Chrome/CDP smoke |

Audit 0 относится **только к распространяемой production-цепочке выбранных форков**, установленной из tarball в чистый npm consumer без overrides. Это не нулевой audit всех devDependencies монорепозитория или всех зависимостей Testplane. Исторический consumer давал 12 high vulnerabilities.

Исходный полный unit-прогон после сборки: 134 failed suites / 412 failed tests. Ошибки исправлены без массового отключения тестов. Удалён `describe.only` в основном E2E, ранее пропущенный iframe moveTo-сценарий включён обратно.

## Что исправлено после предыдущего отчёта

- **React/Lit:** сама команда `getHTML` не отключена. `getHTML()` / `getHTML(true)` возвращают DOM outerHTML, `getHTML(false)` — innerHTML. Закомментирована расширенная upstream v9 реализация object-options. Этот legacy-контракт сохранён; snapshots и вызовы тестов приведены к нему, вложенный open/closed shadow DOM отдельно проверяется селекторами.
- **BrowserFramework:** polling переживает transient execution-context reset, корректно возвращает остальные ошибки и не переносит завершение poll предыдущего spec на следующий.
- **Shadow roots:** отложенная регистрация подключённых hosts в порядке parent-before-child, обычные элементы с attachShadow до append, native/declarative roots и weak pending references. Stencil/Lit проходят.
- **Lighthouse:** target выбирается по типу page и URL; CDP endpoint — по настоящему targetId вместо private frame id или первого элемента списка. Trace Uint8Array декодируется корректно. Проверяются настоящий локальный PWA с manifest/service worker, все семь PWA audits, отрицательный PWA, tracing, metrics и performance score.
- **Контекст и listeners:** успешное переключение обновляет context; неуспешный switchWindow восстанавливает исходное окно. Менеджеры удаляют собственные listeners, сохраняют чужие, очищаются при deleteSession. closeWindow не получает неявного переключения. Предыдущее MaxListenersExceededWarning при проверенном BiDi reload больше не воспроизводится.
- **E2E fixtures:** зависимые от нестабильных внешних сайтов DOM/navigation/auth/iframe/scroll сценарии используют локальные HTTP-страницы. Бесконечное рекурсивное iframe-вложение заменено конечной фикстурой; wait:none проверяется серверно управляемой выдачей HTML. Настоящие браузерные операции и содержательные assertions сохранены.
- **Асинхронные сетевые события:** E2E ждёт появления ожидаемого subresource в живом объекте запроса; завершение BiDi navigate само по себе не гарантирует доставку всех network events. Headers сравниваются без учёта регистра.
- **Повторный поиск $$()[index]:** сохраняет исходные React filters/custom selector arguments. Регрессия найдена независимым review, воспроизведена красными тестами и исправлена.

## Ограничения и оставшаяся работа для PR

- **Edge/Safari исключены по согласованному объёму**, не запускались и не блокируют локальный результат. Reload E2E проверяет переход Chrome → Firefox.
- **AWS/Sauce не подтверждены.** `test:e2e:launch` без credentials завершается с ошибкой при загрузке `e2e/launch/aws.test.ts`. В исходном файле тело теста уже отключено через `return`, но env validation находится на уровне модуля. Файл не подменялся passing stub; локальный launch проверен отдельной точной командой выше. Полный `pnpm run test:e2e` поэтому не объявляется зелёным.
- **Исторические skips/no-op остаются видимыми:** unit, Stencil, source-maps, multiremote, Chrome/Firefox skipped перечислены в таблице. Preact/misc component npm-команды уже содержали `echo "UNSKIP ME" || …`; их exit 0 не является выполнением этих тестов. Они не включены в 84 passed.
- **Linux/Windows и удалённые Selenium/Selenoid/Moon, proxy/TLS не проверены локально.** CI Node matrix обновлена до 22.12 / 22 / 24; её будущий результат не предсказывается. Существующий Windows component CI остаётся отключённым.
- **Полный consumer Testplane integration suite не выполнялся.** Проверен воспроизводимый сценарий его context isolation; соседний checkout не изменялся.
- **Puppeteer 20 → 25 содержит breaking changes помимо Node.js.** Ограниченный адаптер сохраняет найденные Testplane Browser/Context calls, но не произвольный пользовательский API. Подробности — в COMPATIBILITY.md. Firefox-over-CDP removal согласован; Firefox/WebDriver/BiDi и Chromium/CDP не удалены.
- Во время диагностики замечен отдельный существующий дефект NetworkManager: один child может добавляться и на beforeRequestSent, и на responseCompleted. Он не является причиной исправленных падений и не изменялся в этой ветке; дедупликация требует отдельной спецификации/регрессии.

## Воспроизведение и доказательства

Команды монорепозитория, чистой установки и браузерные скрипты приведены в README.md рядом с этим файлом. Скрипты сохраняют audit, dependency tree, tarball и логи в напечатанном временном каталоге.

Локальные артефакты текущей проверки (не входят в Git):

- `/tmp/webdriverio-final-tests`: `build-final.log`, `unit-final.log`, `unit-final.json`, `eslint-final.log`, `typings.log`, `ejslint.log`, `depcheck.log`, `interop.log`, `smoke-final.log`.
- Там же: `e2e-testrunner-final.log`, `e2e-webdriver-final.log`, `e2e-classic.log`, `e2e-multiremote.log`, `e2e-standalone.log`, `launch-local-final.log`; `e2e-launch.log` сохраняет AWS env failure.
- Там же: `consumer-final.log`, `consumer-cdp-final.log`, `consumer-bidi-final.log`, `consumer-min-node-final.log`.
- `/tmp/webdriverio-monorepo-tests/component-release-final.log`: полный component-прогон и coverage; в том же каталоге RED/GREEN-логи lifecycle, polling и shadow regressions.

Пакеты не публиковались. Файлы планов остаются локально и не включаются в PR.

## PR #52: исправления по логам GitHub Actions

Исходный [CI run 34214203198](https://github.com/gemini-testing/webdriverio/actions/runs/34214203198) выявил три причины, не проявившиеся в предыдущем локальном Node 22 прогоне:

- **Node 24 / JSDOM:** нативный Request Node отвергает AbortSignal из JSDOM до вызова fetch mock. Тестовое окружение теперь использует согласованные нативные AbortController/AbortSignal; новая регрессия проверяет создание Request, clone и распространение abort. Производственный HTTP transport не менялся. До исправления локально воспроизведены те же 3 failed suites, после — полный unit-набор на Node 22.21.1 и 24.19.0: **306 suites / 3479 tests passed**, существующие 1 suite / 13 tests skipped. Минимальный Node 22.12.0: targeted regression/polling tests 4 passed.
- **Windows / polling tests:** литерал file:///spec.ts не является абсолютным Windows file URL. Фикстуры теперь получают URL относительно import.meta.url, сохраняя native drive/path. CI раньше завершал runSpec до polling с `File URL path must be absolute`; последующий unhandled rejection был следствием незапущенного poll, а не отдельным production-сбоем.
- **macOS / Lit:** сумма четырёх проверок отсутствующего элемента занимала 1405–1785 мс вместо искусственного лимита 1000 мс. По уточнённому объёму пользователя job Component Tests удалён из Test workflow: Testplane использует собственную реализацию компонентных тестов. Зависимости needs у E2E обновлены, остальные проверки сохранены. Локальные component-команды и код Lit-теста в этом CI-исправлении не меняются; эксперимент по замене временного лимита не включён в коммит.

В следующих E2E jobs заменён выведенный из эксплуатации macos-13 на macos-15-intel, сохраняя Intel-архитектуру и набор проверок. [Официальное уведомление GitHub](https://github.blog/changelog/2025-09-19-github-actions-macos-13-runner-image-is-closing-down/).

Логи локального RED/GREEN и полных Node 22/24 прогонов: `/tmp/webdriverio-ci52`. Успех локальных проверок не объявляется успешным Windows/полным GitHub CI: итог нового CI нужно проверять после push. PR остаётся в текущем статусе, без перевода в draft.

Автоматическая preview-публикация pkg-pr-new для PR отключена: Continuous Releases продолжает сборку, но Publish выполняется только на существующем push-триггере main. Это не npm-релиз; существующий первый PR run запускал preview-публикацию автоматически, поэтому предыдущая фраза «пакеты не публиковались» относится к отсутствию ручного npm publish, а не к действиям этого CI workflow.
