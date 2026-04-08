# License Server — первичное проектирование

## 1) Контекст и цель

Мы проектируем сервер лицензирования для SDK, который разрабатывается другим отделом и для нас является **чёрным ящиком**.

Цели системы:
- Генерация и управление лицензионными ключами.
- Управление организациями-клиентами и их лицензиями (для Sales).
- Предоставление клиентам read-only Dashboard по ключам и лимитам.
- Учёт обращений SDK к серверу для контроля лимитов использования.

## 1.1 Термины (кратко)

- `Tier` — тарифный уровень (`XS`/`S`/`M`/`L`/`XL`/`Unlimited`) с фиксированными лимитами и ценой.
- `Runtime model` — модель учёта runtime: `Model A (Volume)` или `Model B (Concurrency slots)`.
- `Billing term` — период оплаты runtime-контракта: `monthly` или `annual`.
- `Unique part` — уникальная деталь, учитываемая в `Model A` для лимита импортов.
- `Overage` — потребление сверх включённого лимита (для `Model A` оплачивается по повышенной ставке).
- `Annual pool` — годовой пул лимита в `Model A` (`12x` месячного лимита).
- `Headroom` — неиспользованный запас лимита внутри `annual pool`, переносимый на следующие месяцы срока.
- `Slot` — единица параллельной runtime-мощности в `Model B`.
- `Peak concurrency` — максимальное число одновременно занятых слотов в периоде.
- `Environment` — среда исполнения (`public_cloud`/`private_cloud`/`on_prem`) для конкретного runtime-контракта.
- `Renewal` — продление контракта на новый срок.

## 2) Границы ответственности

### В зоне ответственности License Server
- Хранение коммерческого и операционного контура лицензирования:
  - `Organization`, `Project`, `Environment`;
  - лицензионные ключи и feature-наборы;
  - runtime-контракты (`runtime_model`, `tier`, `billing_term`, сроки, статусы);
  - счётчики потребления (`imports`, `overage`, `current_slots_in_use`, `peak_slots_used`, `annual_pool/headroom`);
  - события потребления и изменения контрактов (`renewal`, `upgrade`).
- Выдача/проверка статуса лицензии по запросам SDK.
- Админский CRUD для Sales.
- Клиентский RO-интерфейс для просмотра данных по `Project`/`Environment`: ключи, runtime-контракты, лимиты и потребление.

### Вне зоны ответственности (на текущем этапе)
- Внутренняя логика SDK.
- Локальная защита ключей внутри SDK.
- Биллинг/платёжный контур.

## 3) Роли и доступы

- **Sales/Admin**
  - CRUD организаций.
  - CRUD проектов в рамках организации.
  - CRUD окружений в рамках проекта.
  - CRUD лицензий каждой организации.
  - Настройка параметров лицензии и runtime-контрактов (план, tier, billing term, лимиты, фичи).
  - Управление доступом пользователей (`invite`, назначение ролей, блокировка доступа) в рамках `Organization/Project`.
- **Client (организация, RO)**
  - Просмотр собственных лицензий.
  - Просмотр текущих лимитов и потребления.
- **SDK (service-to-service)**
  - Валидация ключа.
  - Отправка событий использования (например, импорт модели).

## 3.1 Scopes лицензирования (уровни применения)

Модель лицензирования в проекте применяется по уровням:

- `Organization` — владелец договорённостей, лицензий и runtime-контрактов.
- `Project` — основная коммерческая единица для `Development license` (per-project).
- `Environment` (`public_cloud`, `private_cloud`, `on_prem`) — уровень применения `Runtime license` внутри проекта.
- `User` — сущность доступа (IAM/RBAC), а не самостоятельная тарифная единица на текущем этапе.

Краткая схема привязок:

`Organization -> Project(s) -> Environment(s) -> RuntimeContract(s)`

`User(s) -> roles/permissions -> доступ к данным Organization/Project`

Интерпретация для текущего scope:
- Ценообразование и лимиты считаются на уровнях `Project` и `Environment`.
- `Technical support` применяется на уровне `Project` и синхронизирован с `Development license`.
- Пользователи влияют на доступ к функциям Dashboard/Admin, но не формируют стоимость лицензии напрямую.

## 3.2 CC UX scope для лицмодели `F11`

- Текущий UX scope для Client Cabinet: `public_cloud` + `Runtime Model A (volume)`.
- В кабинете отображаются обе категории ключей: `Development` и `Runtime` (модель `F11`).
- Поддерживается структура аккаунта: `Organization -> Project -> User(s) with roles`.
- Для runtime в MVP фокус на потреблении/балансе в помесячной и годовой семантике.
- Расширение на `private_cloud` и `Model B (concurrency)` зафиксировано как следующий этап.

## 4) Модель лицензии

**Источник истины по коммерческой модели:** `sourse_docs/Pricing .html`.

### 4.1 Общая структура лицензирования
- `Development license` — годовая, per-project, без ограничения по числу разработчиков.
- `Technical support` — годовая подписка (`Self-support` / `Confidence` / `Priority`), применяется per-project (aligned с `Development license`).
- `Runtime license` — ключевая часть для нашего сервера лимитов, 2 модели учёта потребления.

### 4.2 Runtime Model A (Volume)
- Тарификация по объёму импортов деталей в периоде (`unique parts`).
- Тиры: `XS`, `S`, `M`, `L`, `XL`, `Unlimited`.
- Есть включённый объём и overage.
- Overage: `1.25x` от unit-rate выбранного тарифа.
- Правила учёта: failed import не списывается; re-import позже считается новым событием.
- Для сборок (`assemblies`) повторно используемые компоненты в одном расчётном контексте учитываются один раз (требует финальной формализации).

### 4.3 Runtime Model B (Max concurrency slots)
- Тарификация по максимуму параллельных runtime-слотов.
- Тиры: `XS`, `S`, `M`, `L`, `XL`, `Unlimited`.
- Слот = один одновременно выполняющийся runtime engine.
- После завершения задачи слот возвращается в пул.

### 4.4 Billing terms для Runtime
- `monthly`: обычный месячный цикл.
- `annual`: стоимость `10x monthly` за 12 месяцев.
- Для Model A в annual-режиме: годовой пул (`12x` месячного лимита), перенос headroom внутри срока.
- Для Model B в annual-режиме: резервирование tier по слотам на срок.
- Upgrade mid-term допустим по pro-rata, downgrade — на renewal.

### 4.5 Контур `Unlimited`
- В обеих runtime-моделях `Unlimited = $15,000/month` (ценовой потолок).
- Для сервера это отдельный тип контракта, где лимитные проверки упрощаются.

### 4.6 Контракты по окружениям
- Runtime-контракт задаётся per-project/per-environment.
- Для одного проекта можно использовать разные runtime-модели в разных окружениях.
  - Пример: `public_cloud` на Model A, `private_cloud` на Model B.

### 4.7 Набор функционала SDK
- Лицензия хранит список доступных фич:
  - либо как массив `feature_codes`;
  - либо как JSON-объект `feature_flags`.

## 5) Основные сущности (доменная модель)

### 5.1 Organization
- `id` (UUID)
- `name`
- `external_ref` (ID в CRM, опционально)
- `status` (`active`, `suspended`, `archived`)
- `created_at`, `updated_at`

### 5.2 LicenseKey
- `id` (UUID)
- `organization_id` (FK)
- `license_key` (уникальный, публичный идентификатор лицензии)
- `key_hash` (храним хеш, сырой ключ не храним после выдачи)
- `license_model` (например, `F11`)
- `license_kind` (`development`, `runtime`)
- `license_guid` (GUID, стабильный идентификатор для Client Cabinet)
- `project_code` / `project_name`
- `environment` (`public_cloud`, `private_cloud`, `on_prem`)
- `valid_from`, `valid_to` (срок действия контракта/подписки)
- `start_build_date` (минимально разрешённая дата бинарника, например `YYYYMMDD`, nullable)
- `min_sdk_version` / `min_build_number` (альтернатива `start_build_date`, nullable)
- `expiration_maintenance` (дата завершения maintenance-доступа, актуально для `development`)
- `platforms` (nullable, список допустимых платформ)
- `features` (JSON / массив кодов)
- `status` (`active`, `revoked`, `expired`)
- `created_at`, `updated_at`

### 5.3 UsageEvent
- `id` (UUID)
- `organization_id` (FK)
- `license_id` (FK)
- `event_type` (например, `model_import`, `slot_acquire`, `slot_release`)
- `event_units` (сколько списать с лимита, default `1`)
- `sdk_version`
- `request_id` (для идемпотентности)
- `event_started_at`, `event_finished_at`
- `filename`
- `file_format`
- `file_size_bytes`
- `ip_address`
- `import_result` (`success`, `failed`, `partial_recognition`)
- `chargeable_status` (`charged`, `not_charged`, `pending_policy`)
- `chargeable_reason`
- `created_at`

### 5.4 RuntimeContract
- `id` (UUID)
- `organization_id` (FK)
- `license_id` (FK)
- `environment` (`public_cloud`, `private_cloud`, `on_prem`)
- `runtime_model` (`volume`, `concurrency`)
- `tier_code` (`XS`, `S`, `M`, `L`, `XL`, `UNLIMITED`)
- `billing_term` (`monthly`, `annual`)
- `period_start`, `period_end`
- `status` (`active`, `paused`, `expired`)
- `created_at`, `updated_at`

### 5.5 RuntimeUsageCounter
- `id` (UUID)
- `runtime_contract_id` (FK)
- `window_type` (`monthly`, `annual_pool`)
- `imports_limit_total` (для `volume`, nullable)
- `imports_consumed` (для `volume`, default `0`)
- `overage_units` (для `volume`, default `0`)
- `peak_slots_used` (для `concurrency`, default `0`)
- `current_slots_in_use` (для `concurrency`, default `0`)
- `window_start`, `window_end`

### 5.6 ConcurrencySlotEvent
- `id` (UUID)
- `runtime_contract_id` (FK)
- `request_id` (идемпотентность)
- `action` (`acquire`, `release`)
- `worker_id` / `job_id`
- `slots` (обычно `1`)
- `created_at`

### 5.7 Project
- `id` (UUID)
- `organization_id` (FK)
- `code` (уникальный код проекта в рамках организации)
- `name`
- `status` (`active`, `archived`)
- `created_at`, `updated_at`

### 5.8 ProjectEnvironment
- `id` (UUID)
- `project_id` (FK)
- `environment` (`public_cloud`, `private_cloud`, `on_prem`)
- `status` (`active`, `archived`)
- `created_at`, `updated_at`

### 5.9 UserMembership
- `id` (UUID)
- `organization_id` (FK)
- `project_id` (FK, nullable)
- `user_email`
- `role` (`org_admin`, `sales_manager`, `project_admin`, `viewer`)
- `status` (`invited`, `active`, `blocked`)
- `created_at`, `updated_at`

## 6) Функциональные требования

### 6.1 Генерация ключей
- Генерация уникального ключа достаточной криптостойкости.
- Единоразовый показ полного ключа в UI/API ответа на создание.
- Проверка конфликтов по уникальности.

### 6.2 CRUD организаций (Sales)
- Создание/редактирование/архивация/просмотр организаций.
- Нельзя удалить организацию физически при наличии лицензий или событий; используем soft-delete/архивацию.

### 6.3 CRUD лицензий (Sales)
- Создание нескольких лицензий на одну организацию.
- Редактирование параметров в допустимых пределах (например, увеличить лимит).
- Отзыв ключа (`revoked`).
- Просмотр истории изменений (желательно через audit log).

### 6.3a CRUD проектов и окружений (Sales/Admin)
- Создание/редактирование/архивация проектов в рамках организации.
- Создание/редактирование/архивация окружений в рамках проекта.
- Проверка консистентности: нельзя архивировать проект/окружение при наличии активных runtime-контрактов без явной процедуры перевода/закрытия.

### 6.3b Управление пользователями и ролями (Admin)
- Приглашение пользователей в организацию/проект.
- Назначение и изменение ролей доступа.
- Блокировка/деактивация доступа пользователя без удаления истории действий.

### 6.4 Dashboard RO (Client)
- Список лицензий и runtime-контрактов своей организации в разрезе `Project` и `Environment`.
- По каждой лицензии/контракту:
  - статус;
  - срок действия;
  - тип лицензии (`development`/`runtime`) и модель (`F11`);
  - доступные фичи;
  - `start_build_date` или `min_sdk_version/min_build_number`;
  - `expiration_maintenance` (для development-лицензий);
  - `runtime_model`, `tier`, `billing_term`;
  - лимит/израсходовано/остаток;
  - `overage`, `current_slots_in_use`, `peak_slots_used`, `annual_pool/headroom` (где применимо).
- **Future feature (не в текущем scope):** billing-раздел с возможностью покупки/продления/апгрейда runtime-лицензии из клиентского Dashboard.

### 6.4a Детальный журнал RT-лицензий (Client RO)
- Для каждой `runtime` лицензии в Client Cabinet доступен детальный журнал usage-событий.
- Минимальные поля журнала: `event_started_at`, `event_finished_at`, `filename`, `file_format`, `file_size_bytes`, `ip_address`, `import_result`, `chargeable_status`.
- Журнал должен поддерживать фильтрацию по периоду, проекту, окружению и лицензии.

Пример события usage-log (JSON):

```json
{
  "event_id": "5e57f6a2-1e11-4f4f-9eb0-2f23a1f53c07",
  "organization_id": "d7f0a8cc-42ad-4e4a-b0ce-29f7f5423de7",
  "project_id": "3f2c0a0f-e4cc-4f7f-8a90-f3f0af2b3fd7",
  "environment": "public_cloud",
  "license_id": "fedc-ba09-2414-457f",
  "license_model": "F11",
  "runtime_model": "volume",
  "tier": "L",
  "request_id": "req_2026_04_08_000123",
  "sdk_version": "2026.01.15",
  "event_type": "model_import",
  "event_started_at": "2026-04-08T10:15:01Z",
  "event_finished_at": "2026-04-08T10:15:09Z",
  "filename": "gearbox_housing.step",
  "file_format": "STEP",
  "file_size_bytes": 1843200,
  "ip_address": "203.0.113.24",
  "import_result": "success",
  "chargeable_status": "charged",
  "chargeable_reason": "model_import_success",
  "charged_units": 1,
  "counter_before": 12499,
  "counter_after": 12500,
  "created_at": "2026-04-08T10:15:10Z"
}
```

### 6.5 Учёт обращений SDK
- Endpoint при каждом лицензионно-значимом действии (например, импорт модели).
- Атомарное списание лимитов.
- Защита от повторной обработки через `request_id` (идемпотентность).
- Учет результата импорта (`success`, `failed`, `partial_recognition`) с раздельной логикой тарификации.

### 6.6 Контроль runtime-модели Volume (Model A)
- Учёт импортов как тарифицируемых событий в рамках текущего окна.
- Хранение лимита по контракту и вычисление остатка.
- Фиксация overage при выходе за лимит.
- Поддержка annual-пула (`12x` месячного лимита) с переносом headroom внутри срока.
- `failed import` не должен уменьшать лимит.
- Для `partial_recognition` требуется отдельная policy-настройка (списывать/не списывать) с прозрачной фиксацией причины в журнале.

### 6.7 Контроль runtime-модели Concurrency (Model B)
- Выдача и возврат слотов в реальном времени.
- Гарантия, что `current_slots_in_use` не превышает tier-limit (кроме `UNLIMITED`).
- Учёт `peak_slots_used` за расчётный период.
- Идемпотентная обработка `acquire/release`.

### 6.8 Отслеживание релизов SDK
- Сервер хранит справочник релизов SDK (версия, дата релиза, статус поддержки).
- Сервер принимает `sdk_version` в запросах и сопоставляет её с известными релизами.
- Возможность помечать версии как `supported`, `deprecated`, `blocked`.
- Возможность задавать лицензионные ограничения по версиям (например, минимальная/максимальная поддерживаемая версия для конкретной лицензии).
- Отображение версии SDK и статуса поддержки в админских отчётах и клиентском Dashboard (RO).

#### Сценарий проверки `sdk_version` (пошагово)
1. SDK отправляет запрос (`/api/sdk/license/validate` или `/api/sdk/usage/consume`) с полями: `license_key`, `sdk_version`, `request_id`, `event_type`.
2. Сервер валидирует ключ и состояние лицензии/контракта (статус, срок, лимиты, модель runtime).
3. Сервер находит `sdk_version` в реестре релизов.
4. Если версия `supported` — операция продолжается.
5. Если версия `deprecated` — операция продолжается, но в ответ добавляется предупреждение о необходимости обновления.
6. Если версия `blocked` (или не найдена, при строгой политике) — операция отклоняется с кодом ошибки.

Пример семантики ответов:
- `200 OK` + `license_status=valid` + `sdk_status=supported`.
- `200 OK` + `license_status=valid` + `sdk_status=deprecated` + `warning_code=SDK_DEPRECATED`.
- `403 Forbidden` + `error_code=SDK_VERSION_BLOCKED`.
- `403 Forbidden` + `error_code=SDK_VERSION_UNKNOWN` (если принята строгая политика для неизвестных версий).

#### Политика обработки версий SDK (варианты)

| Ситуация | Soft policy (рекомендовано на старт) | Strict policy (для повышенного контроля) |
|---|---|---|
| `supported` | Разрешить операцию | Разрешить операцию |
| `deprecated` | Разрешить + warning (`SDK_DEPRECATED`) | Блокировать после grace-периода |
| `blocked` | Блокировать (`SDK_VERSION_BLOCKED`) | Блокировать (`SDK_VERSION_BLOCKED`) |
| `unknown` | Разрешить + warning (`SDK_VERSION_UNKNOWN`) и логировать | Блокировать (`SDK_VERSION_UNKNOWN`) |

Рекомендуемый старт: **Soft policy** на 1-й итерации (быстрый запуск без массовых блокировок), затем переход на **Strict policy** после стабилизации процессов обновления SDK у клиентов.

### 6.9 Отчётность для Sales и Client по runtime
- По Model A: лимит, потребление, overage, остаток пула.
- По Model B: tier, текущая конкурентность, пиковая конкурентность, превышения/отказы.
- По срокам: текущий billing-term, дата renewal, изменения tier.

### 6.10 Billing и покупка лицензий (feature backlog)
- Клиентский Dashboard должен поддержать самообслуживание по лицензиям: покупка, продление, upgrade tier/term.
- Интеграция с внешним биллингом/платёжным контуром и статусы заказов/инвойсов.
- Лицензионный сервер применяет изменения в контрактах после подтверждения оплаты.
- **Статус:** feature зафиксирован в проекте, но **не входит в текущий этап реализации**.

## 7) Минимальный API-контур (черновик)

### Admin/Sales API
- `POST /api/admin/organizations`
- `GET /api/admin/organizations`
- `GET /api/admin/organizations/{id}`
- `PATCH /api/admin/organizations/{id}`
- `DELETE /api/admin/organizations/{id}` (логическое удаление)

- `POST /api/admin/organizations/{id}/projects`
- `GET /api/admin/organizations/{id}/projects`
- `GET /api/admin/projects/{projectId}`
- `PATCH /api/admin/projects/{projectId}`
- `DELETE /api/admin/projects/{projectId}` (логическое удаление)

- `POST /api/admin/projects/{projectId}/environments`
- `GET /api/admin/projects/{projectId}/environments`
- `PATCH /api/admin/environments/{environmentId}`
- `DELETE /api/admin/environments/{environmentId}` (логическое удаление)

- `POST /api/admin/organizations/{id}/users/invite`
- `GET /api/admin/organizations/{id}/users`
- `PATCH /api/admin/users/{membershipId}/role`
- `POST /api/admin/users/{membershipId}/block`

- `POST /api/admin/organizations/{id}/licenses`
- `GET /api/admin/organizations/{id}/licenses`
- `GET /api/admin/licenses/{licenseId}`
- `PATCH /api/admin/licenses/{licenseId}`
- `POST /api/admin/licenses/{licenseId}/revoke`

- `POST /api/admin/runtime-contracts`
- `GET /api/admin/runtime-contracts`
- `PATCH /api/admin/runtime-contracts/{contractId}`
- `POST /api/admin/runtime-contracts/{contractId}/upgrade`
- `POST /api/admin/runtime-contracts/{contractId}/renew`

### Client RO API
- `GET /api/client/me/projects`
- `GET /api/client/me/licenses?project_id=&environment=`
- `GET /api/client/me/licenses/{licenseId}`
- `GET /api/client/me/licenses/{licenseId}/usage`
- `GET /api/client/me/runtime-contracts?project_id=&environment=&runtime_model=`
- `GET /api/client/me/runtime-contracts/{contractId}`
- `GET /api/client/me/runtime-contracts/{contractId}/usage`
- `GET /api/client/me/runtime-licenses/{licenseId}/journal?from=&to=&project_id=&environment=`

### SDK API
- `POST /api/sdk/license/validate`
- `POST /api/sdk/usage/consume`
- `POST /api/sdk/concurrency/acquire`
- `POST /api/sdk/concurrency/release`
- `POST /api/sdk/usage/report` (расширенный отчёт по импорту с метаданными файла и результатом)

## 8) Бизнес-правила (черновик)

- Лицензия недействительна, если:
  - `status != active`
  - текущая дата вне `valid_from..valid_to`
- Для `runtime_model=volume`:
  - каждый валидный `model_import` увеличивает `imports_consumed`;
  - failed import не списывается;
  - при превышении лимита начисляется `overage_units` по правилу `1.25x` unit-rate или применяется блокировка (по политике контракта).
- Для `start_build_date`/`min_sdk_version`:
  - запросы со слишком ранними сборками/версиями блокируются с кодом политики.
- Для журналирования:
  - метаданные события импорта сохраняются для клиентского аудита и расчёта chargeability.
- Для `runtime_model=concurrency`:
  - `acquire` отклоняется, если достигнут лимит tier (кроме `UNLIMITED`);
  - `release` обязан уменьшать `current_slots_in_use` и быть идемпотентным.
- Для `billing_term=annual`:
  - Model A работает через годовой пул;
  - upgrade mid-term возможен pro-rata, downgrade — при renewal.

## 9) Безопасность (базовый уровень)

- Ключи храним в виде хеша (`key_hash`), полный ключ не логируем.
- Все SDK-запросы подписываются (например, HMAC + timestamp + nonce).
- Rate limit на публичные и SDK endpoint'ы.
- Audit log для операций Sales/Admin.

## 10) Наблюдаемость и отчётность

- Метрики:
  - количество валидаций лицензий;
  - количество списаний лимитов;
  - импорты по Model A (включая overage);
  - текущая и пиковая конкурентность по Model B;
  - ошибки валидации по причинам;
  - остатки лимитов в разрезе организаций/лицензий.
- Логи событий использования и админских изменений.

## 11) Открытые вопросы (критично уточнить)

### 11.1 SDK и протокол
- Как SDK аутентифицируется (HMAC, mTLS, ключи, ротация)?
- Какие поля SDK гарантированно передаёт в каждом запросе (`request_id`, `sdk_version`, `job_id/worker_id`, `environment`)?
- Что является источником истины для блокировки по `start_build_date` vs `min_sdk_version/min_build_number`?
- Нужен ли единый формат версий/билдов для корректного сравнения (`semver`, дата, внутренний build number)?

### 11.2 Модель F11 и границы MVP
- Подтверждаем ли, что `F11 MVP` = только `public_cloud + Model A (volume)`?
- Если да, как маркируем в UI/API объекты `private_cloud`/`Model B` (hidden, read-only, feature-flag)?
- В примерах встречаются `private_cloud` и `concurrency`: это уже согласованный next phase или просто справочный пример?

### 11.3 Тарификация и лимиты (Model A/Model B)
- Что именно считать `unique part` для расчёта лимита в `Model A`?
- Какой детерминированный ключ уникальности части используем (хеш геометрии, нормализованный состав метаданных и т.п.)?
- Как окончательно трактовать `partial_recognition` для тарификации (`charged`/`not_charged`)?
- Подтверждаем ли правило для `assemblies`: reused-компоненты считаются один раз в рамках расчётного контекста?
- Для `Model B`: кто инициирует `release`, если worker аварийно завершился, и нужен ли `TTL/heartbeat`?

### 11.4 Журналирование и качество данных
- Подтверждаем ли обязательные поля детального RT-журнала: `event_started_at`, `event_finished_at`, `filename`, `file_format`, `file_size_bytes`, `ip_address`, `import_result`, `chargeable_status`?
- Как нормализуем пары `event_started_at/event_finished_at` при ретраях и частичных повторах?
- Как обрабатываются дубликаты/отложенные события (`request_id`, window dedup, late arrival policy)?
- Нужны ли дополнительные поля аудита (например, `source_region`, `sdk_session_id`)?

### 11.5 Privacy, retention, compliance
- Какой срок хранения для `filename` и `ip_address` в клиентском журнале?
- Какие требования к маскированию/обфускации `ip_address` и потенциально чувствительных имён файлов?
- Есть ли ограничения по регионам хранения (data residency) и экспорту журналов?

### 11.6 Коммерческие правила и биллинг
- Нужен ли enforcement правила fair-use для `UNLIMITED` на стороне License Server?
- Фиксируем ли цены в License Server или получаем тарифные параметры из внешнего billing-сервиса?
- Как управляем изменениями цены на renewal (версионирование прайса, дата вступления в силу)?
- Кто является источником истины по `upgrade/downgrade` и `pro-rata` расчётам: License Server или billing-контур?

### 11.7 Сроки, timezone и жизненный цикл контрактов
- Проверка контрактных окон, renewal и закрытия периодов всегда в `UTC`?
- Нужны ли бизнес-исключения по timezone клиента для отображения дат в Client Cabinet?
- Какие состояния жизненного цикла обязательны для всех сущностей (`active`, `suspended`, `expired`, `archived`), и кто имеет право перехода между ними?

### 11.8 Доступы и роли
- Финальный набор ролей (`org_admin`, `project_admin`, `sales_manager`, `viewer`) утверждён?
- Может ли `Sales` управлять пользователями, или это зона только `Admin`?
- Нужны ли отдельные права на просмотр детального RT-журнала и экспорт usage-данных?

## 12) Предлагаемый следующий шаг

После согласования документа:
- Зафиксировать ERD (таблицы и связи).
- Описать OpenAPI-контракт для Admin/Client/SDK endpoint'ов.
- Согласовать с SDK-командой протоколы `model_import` и `slot acquire/release`.
- Подтвердить коммерческие правила runtime (`monthly/annual`, overage, upgrade/downgrade) с Sales/Product.
