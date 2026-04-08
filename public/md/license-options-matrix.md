# License Options Matrix (на базе Pricing)

## 0) Глоссарий (быстрые термины)

- `Tier` — тарифный уровень (`XS`, `S`, `M`, `L`, `XL`, `Unlimited`) с фиксированными лимитами/ценой.
- `Runtime model` — модель учёта runtime: `Model A (Volume)` или `Model B (Concurrency slots)`.
- `Billing term` — период оплаты runtime-контракта: `monthly` или `annual`.
- `Unique part` — уникальная деталь, учитываемая в Model A для лимита импортов.
- `Overage` — потребление сверх включённого лимита (для Model A оплачивается по повышенной ставке).
- `Annual pool` — годовой пул лимита в Model A (`12x` месячного), доступный в annual-контракте.
- `Headroom` — неиспользованный запас лимита внутри annual-пула, который переносится на следующие месяцы того же годового срока (пример: использовал 6k из условных 10k/мес, headroom = 4k).
- `Slot` — единица параллельной runtime-мощности в Model B (одна одновременно выполняемая engine-задача).
- `Peak concurrency` — максимальное число одновременно занятых слотов в периоде.
- `Environment` — среда исполнения (`public_cloud`, `private_cloud`, `on_prem`), для которой оформляется runtime-контракт.
- `Unlimited` — тариф без верхнего лимита в рамках модели, с фиксированной monthly-ценой.
- `Renewal` — продление контракта на новый срок: для `monthly` фактически помесячное продление, для `annual` новый 12-месячный период по правилу цены `10x monthly` (если тариф не изменился коммерчески). Downgrade обычно на renewal, upgrade может быть mid-term по pro-rata.

## 1) Назначение документа

Этот документ фиксирует все варианты лицензирования и оплаты, релевантные для проекта License Server.

**Источник коммерческой модели:** `sourse_docs/Pricing .html`.

Документ полезен для:
- онбординга (быстро понять, что и как продаётся);
- Sales/PM (собрать корректную коммерческую конфигурацию);
- команды License Server (правильно реализовать правила лимитов/контрактов).

## 2) Лицензирование — верхнеуровневая структура

Полная коммерческая конфигурация клиента состоит из 3 независимых блоков:

1. `Development license` (годовая, per-project)
2. `Technical support` (годовая, per-project, aligned с `Development license`)
3. `Runtime license` (monthly/annual, Model A или Model B, по окружениям)

Итоговая «сделка» = комбинация этих 3 блоков.

---

## 3) Development license — матрица вариантов

### 3.1 Базовые планы

| План | Стоимость (год) | Процессы | CAD-форматы | Geometry/Modeling | Web Visualization |
|---|---:|---|---|---|---|
| Start | $9K | Любой 1: CNC или Sheet Metal или Injection Molding | Essentials | Included | Included |
| Plus | $15K / $18K / $20K* | Любые 2 | Essentials + Extended | Included | Included |
| Pro | $30K | Все 3 | Essentials + Extended + Advanced | Included | Included |

\* В сохранённой странице pricing у Plus указаны несколько значений. Требует финального подтверждения с Sales.

### 3.2 Add-ons к Development

#### Дополнительные процессы

| Опция | Цена |
|---|---:|
| +1 process module | $6K |
| +2 process modules | $10K |

#### CAD format bundles

| Набор | Состав (кратко) | Цена |
|---|---|---:|
| Essentials | STEP, STL, DXF | Included |
| Extended | Parasolid X_T, ACIS SAT, 2D PDF, Open CASCADE, OBJ, 3MF | $5K |
| Advanced | Solidworks, Fusion | $7.5K |
| Premium | CATIA, NX, Creo, SolidEdge, Inventor, JT, DWG, PRC | $15K |
| A-la-carte | Выбор отдельных форматов | $1.25K–$5K за формат |

#### Специализированные алгоритмы

| Опция | Цена |
|---|---:|
| Nesting | $2.5K |

### 3.3 Правила по Development

- Лицензия на проект (одна application line).
- Поддерживаются deployment-модели: public cloud / private cloud / on-prem.
- Доступ к новым релизам в срок действия подписки.
- Annual prepaid; renewal обязателен.

---

## 4) Technical support — матрица вариантов

| План | Цена (год) | Приоритет багов | Канал | Помощь/консалтинг | Eng builds | Remote debugging |
|---|---:|---|---|---|---|---|
| Self-support | Free | Lower | Tickets | - | - | - |
| Confidence | $3,950 | Medium | Tickets | Up to 40 person-hours | Yes | - |
| Priority | $9,950 | Higher | Tickets + Zoom | Up to 125 person-hours | Yes | Yes |

Правило scope:
- `Technical support` оформляется на уровне `Project` и синхронизирован с `Development license` этого проекта.

---

## 5) Runtime license — матрица вариантов

## 5.1 Model A (Volume, parts/month)

| Tier | Monthly limit (unique parts) | Monthly price | Included unit ($/part) | Overage ($/part) |
|---|---:|---:|---:|---:|
| XS | 500 | $200 | $0.40 | $0.50 |
| S | 2,500 | $600 | $0.24 | $0.30 |
| M | 10,000 | $1,800 | $0.18 | $0.225 |
| L | 50,000 | $6,000 | $0.12 | $0.15 |
| XL | 200,000 | $12,000 | $0.06 | $0.075 |
| Unlimited | - | $15,000 | - | - |

Правила учёта:
- импорт считается в момент build/import;
- re-used components в assembly считаются один раз;
- failed imports не тарифицируются;
- повторный импорт позже считается новым событием;
- overage рассчитывается как `1.25x` от unit-rate плана.

## 5.2 Model B (Max concurrency slots)

| Tier | Max concurrent slots | Monthly price | Price per slot |
|---|---:|---:|---:|
| XS | 1 | $500 | $500 |
| S | 5 | $1,500 | $300 |
| M | 10 | $2,400 | $240 |
| L | 25 | $4,500 | $180 |
| XL | 100 | $12,000 | $120 |
| Unlimited | - | $15,000 | n/a |

Правила учёта:
- slot = одна параллельная runtime engine-задача;
- при завершении job слот возвращается в pool;
- ограничение определяется пиковым параллелизмом.

## 5.3 Monthly vs Annual для Runtime

| Параметр | Monthly | Annual |
|---|---|---|
| Оплата | Ежемесячно | `10x` monthly price за 12 месяцев |
| Model A лимит | Месячный reset | Годовой пул `12x` месячного лимита |
| Model A headroom | Нет переноса между месяцами | Headroom внутри годового срока переносится |
| Model B | Фикс tier на месяц | Резерв tier на срок |
| Upgrade/Downgrade | По правилам контракта | Upgrade mid-term pro-rata, downgrade на renewal |

## 5.4 Runtime по окружениям

- Контракт задаётся per-project / per-environment.
- На один проект можно использовать разные runtime-модели в разных окружениях.
  - Пример: public cloud = Model A, private cloud = Model B.

---

## 6) Комбинаторика: как собрать итоговую лицензию

Итоговая конфигурация:

`Deal = Development(plan + add-ons) + Support(plan) + Runtime(для каждого environment)`

### 6.1 Что обязательно указать при создании контракта

- Организация / проект.
- Environment (`public_cloud`/`private_cloud`/`on_prem`).
- Runtime model (`volume`/`concurrency`).
- Tier (`XS..XL/Unlimited`).
- Billing term (`monthly`/`annual`).
- Feature set (`feature_codes` / `feature_flags`).
- Срок действия (`valid_from`, `valid_to`).

### 6.2 Ключевые проверки совместимости

- Runtime-контракт всегда привязан к конкретному environment.
- Для одного environment активен один основной runtime-контракт на период.
- `Unlimited` снимает лимитные проверки, но не отключает аудит/метрики.
- Для annual-контрактов нужен отдельный режим расчёта пула/сроков.

---

## 7) Примеры готовых пакетов (для ориентира)

Ниже не «официальные продукты», а рабочие шаблоны для быстрых оценок.

## 7.1 Starter (Pilot / PoC)

- Development: `Start` + минимум add-ons.
- Support: `Self-support` или `Confidence`.
- Runtime: Model A `XS`/`S`, billing `monthly`.
- Когда подходит: редкие импорты, пилотный запуск, неопределённый трафик.

## 7.2 Growth (SMB / устойчивый поток)

- Development: `Plus` + нужные CAD bundles.
- Support: `Confidence`.
- Runtime: 
  - Model A `M/L`, если пики и волатильность;
  - или Model B `S/M`, если поток стабильный.
- Billing: часто `annual` для экономии.

## 7.3 Enterprise (крупная платформа)

- Development: `Pro` + расширенные add-ons (включая Premium/алгоритмы).
- Support: `Priority`.
- Runtime:
  - Model B `L/XL`, если высокая постоянная загрузка;
  - `Unlimited`, если нужен предсказуемый потолок расходов.
- Часто mixed-модель по окружениям.

---

## 8) Что это значит для License Server

Сервер должен уметь:
- хранить и версионировать runtime-контракты по окружениям;
- считать лимиты для Model A и конкурентность для Model B;
- поддерживать monthly/annual семантику;
- учитывать overage и события usage;
- обеспечивать прозрачную отчётность для Sales и Client Dashboard.

## 9) Быстрый checklist для онбординга

Перед заведением новой лицензии всегда проверь:
- Что за проект и какие окружения реально используются.
- Нужна ли клиенту модель `volume` или `concurrency`.
- Есть ли риск overage и стоит ли сразу брать tier выше.
- Нужен ли annual-пул (часто выгоднее при сезонности).
- Какие CAD/process add-ons обязательны для use case.
- Нужен ли `Priority support` на старте внедрения.
