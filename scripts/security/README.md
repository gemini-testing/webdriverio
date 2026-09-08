# Воспроизводимые проверки security-update

Скрипты не публикуют пакеты, не меняют версии и не используют npm overrides. Все npm-установки выполняются в новых временных каталогах. Сборка обновляет обычные build-артефакты репозитория. Нужны Node **>=22.12.0**, установленный pnpm и зависимости workspace (`pnpm install`).

## 1. Audit до и после

Выполнить из корня checkout:

```bash
REPO="$PWD"
node "$REPO/scripts/security/prepare.mjs" --baseline
node "$REPO/scripts/security/prepare.mjs"
```

Первый запуск устанавливает исторические опубликованные версии; второй пересобирает и упаковывает восемь текущих пакетов. Каждый выводит **свой** путь `Consumer: ...`. Каталоги не удаляются автоматически: в них остаются tarball, логи сборки/установки, полный dependency tree, audit и evidence.json с версией Node/platform/revision.

Ожидание на 2026-09-08: **12 vulnerabilities → 0**. Число baseline может меняться с базой advisories; после исправления скрипт требует ровно 0. Он также проверяет отсутствие старых вложенных workspace-пакетов, undici, extract-zip, CJS/ESM-входы и TypeScript-контракт getPuppeteer/context isolation. Скрипт завершится с ошибкой, если сборка, audit или проверка не пройдёт.

## 2. Реальные браузерные сценарии

Перейти в **исправленный** consumer, путь которого напечатал второй запуск:

```bash
cd /absolute/path/from/output/consumer
node check-consumer.mjs

# Найти установленный Chrome либо скачать браузер при его отсутствии.
node browser.mjs

# Явно скачать выбранную версию в browser-cache текущего consumer.
BROWSER_VERSION=115.0.5790.170 node browser.mjs
BROWSER=firefox BROWSER_VERSION=stable node browser.mjs

# Использовать конкретный установленный бинарник.
BROWSER_BINARY="/absolute/path/to/chrome" node browser.mjs

# Выполнить тот же smoke другим Node, включая минимальную версию.
/absolute/path/to/node-v22.12.0/bin/node check-consumer.mjs
/absolute/path/to/node-v22.12.0/bin/node browser.mjs
```

Переменные окружения: `BROWSER=chrome|firefox`, `BROWSER_VERSION`, `BROWSER_BINARY`, `BROWSER_CACHE`. В PowerShell задавать их через `$env:BROWSER = "firefox"` и т. п. Приведённые shell-команды — для bash/zsh; Windows пока не проверен.

Chrome smoke проверяет:

- WebDriver-сессию, навигацию, поиск элемента, reload/disconnect;
- getPuppeteer и повторное использование соединения;
- старые вызовы Testplane `createIncognitoBrowserContext()` и `isIncognito()`;
- изоляцию cookies, открытие страницы в контексте, соответствие `_targetId` WebDriver-окну, переключение окна;
- CDP response mock/restore, CPU/network throttling.

Firefox smoke проверяет обычный WebDriver, **не Firefox/CDP**. Selenium Grid, Selenoid/Moon, удалённые TLS/proxy-окружения этим локальным smoke не покрываются.

`BIDI=1 node browser.mjs` включает BiDi. Исторический consumer не подменял ответ `mock('**/api')`; этот существующий дефект исправлен отдельно. Скрипт проверяет mock/restore, повторное создание мока после reload и отсутствие зависания неперехватываемых запросов.

Скачивание браузеров требует сети и места на диске. Для ZIP нужны системный `unzip` либо совместимый optional `yauzl`; Windows использует системные инструменты. Старые браузеры проверять только с локальными тестовыми страницами и отдельными профилями.

## 3. A/B-сравнение исходного Puppeteer 20 и нового 25

Старый клиент устанавливается **отдельно**, чтобы не загрязнить исправленный audit:

```bash
OLD_CLIENT=$(mktemp -d)
npm install --prefix "$OLD_CLIENT" --ignore-scripts --no-audit --no-fund puppeteer-core@20.9.0

# Находясь в исправленном consumer:
OLD_PUPPETEER_DIR="$OLD_CLIENT" node compare-puppeteer.mjs
OLD_PUPPETEER_DIR="$OLD_CLIENT" BROWSER_VERSION=115.0.5790.170 node compare-puppeteer.mjs
```

Оба клиента по очереди подключаются к одному браузеру. `puppeteer-comparison.json` содержит PASS/FAIL/INFO/SKIP каждой проверки; каждая операция ограничена таймаутом. **Exit code 1 здесь ожидаем:** проверяются сырые upstream-клиенты, без нашего адаптера. В 25 отсутствуют старые методы контекстов, isConnected, XPath/waitForTimeout. Их нельзя объявлять совместимыми на основании одного успешного connect.

Для собственного CDP HTTP endpoint можно задать `CDP_BROWSER_URL=http://127.0.0.1:9222`: тогда скрипт не создаёт WebDriver-сессию и не закрывает внешне запущенный браузер. В частности, это позволяет проверить старый Firefox без ограничений современного geckodriver. Firefox 128 запускался отдельно с новым профилем и настройкой `user_pref("remote.active-protocols", 3);`. Полная совместимость этого сценария **не подтверждена**.

## Что эти проверки не доказывают

- Нулевой audit касается выбранной production-цепочки, не всего монорепозитория и не всех остальных зависимостей Testplane.
- Chrome 115 и 152 не представляют все промежуточные версии, облачные гриды и пользовательские расширения Puppeteer API.
- Адаптер сохраняет API изоляции, используемый текущим Testplane, а не весь Puppeteer 20 API.
- Unit baseline был красным до обновления. После отдельного ремонта тестов и дефектов весь unit-набор проходит с включённой проверкой необработанных ошибок; это не заменяет component/cloud/E2E проверки.

Разбор несовместимостей и результаты A/B находятся в `COMPATIBILITY.md` рядом с этим файлом.

## 4. Проверки монорепозитория

Из корня checkout после `pnpm install`:

```bash
pnpm run compile:all:all
pnpm run test:unit:run
pnpm run test:typings
pnpm run test:eslint
pnpm run test:ejslint
pnpm run test:depcheck
pnpm run test:interop
CI=1 pnpm run test:smoke
CI=1 pnpm run test:component
pnpm run test:e2e:testrunner
pnpm run test:e2e:classic
pnpm run test:e2e:multiremote
pnpm run test:e2e:webdriver
pnpm run test:e2e:standalone
pnpm exec vitest --config ./e2e/vitest.config.ts --run e2e/launch/reloadSession.test.ts
```

Компоненты запускаются в headless Chrome, локальная WebDriver-матрица — Chrome/Firefox, без Edge/Safari. Не пересобирать пакеты одновременно с browser-runner: Vite HMR изменяет исполняемый код посреди теста. Основные DOM/navigation/PWA E2E используют настоящие локальные HTTP-фикстуры вместо нестабильных внешних страниц; браузерные команды не замоканы.

Последняя команда запускает только локальный launch-сценарий. Общий `test:e2e:launch` дополнительно загружает исторически отключённый внутри тела AWS-тест, который требует credentials на уровне модуля; без них команда падает. AWS/Sauce здесь не считаются пройденными. Существующие skipped/no-op наборы и точные результаты перечислены в `TEST-RESULTS.md`.
