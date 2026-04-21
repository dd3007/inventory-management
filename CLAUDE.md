# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Factory Inventory Management System demo — full-stack app with Vue 3 frontend, FastAPI backend, and in-memory mock data loaded from JSON (no database). Built as a Claude Code workshop demo.

## Critical Tool Usage Rules

### Subagents (Task tool)
- **vue-expert**: **MANDATORY for any create/significant-modify of a `.vue` file.** Also use for reactivity issues, complex state, performance tuning.
- **code-reviewer**: Use after writing significant code to review quality.
- **Explore**: Broad codebase searches or pattern discovery across multiple files.
- **general-purpose**: Multi-step tasks that don't fit the above.

### Skills
- **backend-api-test**: Use when writing or modifying tests in `tests/backend/` (pytest + FastAPI TestClient).

### MCP Tools
- **GitHub MCP** (`mcp__github__*`): Use for all GitHub operations. **Exception:** local branches — use `git checkout -b`, not `mcp__github__create_branch`.
- **Playwright MCP** (`mcp__playwright__*`): Use for browser testing against `http://localhost:3000` (frontend) and `http://localhost:8001` (API).

### Nested CLAUDE.md files
Both subtrees have their own deeper guidance — read them when working in that area:
- `client/CLAUDE.md` — Vue 3 Composition API patterns, reactivity, chart implementation, API integration conventions.
- `server/CLAUDE.md` — FastAPI/Pydantic patterns, filtering conventions, mock data management.

## Stack
- **Frontend**: Vue 3 (Composition API) + Vue Router + Vite (port 3000). Axios for HTTP. Custom i18n (en/ja) in `client/src/locales/` via `useI18n` composable. Auth state in `useAuth` composable. Charts are custom SVG — no charting library.
- **Backend**: Python 3.11+ + FastAPI + Pydantic v2 (port 8001). CORS wide open (demo only).
- **Data**: JSON files in `server/data/` loaded at import time by `server/mock_data.py`. Changes don't persist — restart the server to reload.
- **Package managers**: `uv` for Python, `npm` for Node.

## Commands

### Run everything
```bash
./scripts/start.sh   # starts both servers, logs to /tmp/inventory-{backend,frontend}.log
./scripts/stop.sh    # stops both (uses PID files + port fallback)
```
Windows users: the shell scripts are macOS/Linux only — use the manual commands below in separate terminals.

### Run servers manually
```bash
# Backend (first time: uv venv && uv sync)
cd server && uv run python main.py          # http://localhost:8001  (/docs for Swagger UI)

# Frontend (first time: npm install)
cd client && npm run dev                    # http://localhost:3000
```

### Tests (pytest, from `tests/` directory)
```bash
cd tests
uv run pytest -v                                              # all tests
uv run pytest backend/test_inventory.py -v                    # single file
uv run pytest backend/test_inventory.py::TestInventoryEndpoints::test_get_all_inventory -v   # single test
uv run pytest --cov=../server --cov-report=html               # with coverage
```
`tests/pytest.ini` pins `testpaths = backend` and `asyncio_mode = auto`.

### Production build (frontend)
```bash
cd client && npm run build   # output: client/dist/
```

## Architecture

### Data flow
Vue view → shared filters from `useFilters` composable → `client/src/api.js` (axios, builds `URLSearchParams` and drops `'all'` values) → FastAPI endpoint → `apply_filters` / `filter_by_month` in `server/main.py` operating on in-memory lists from `mock_data.py` → Pydantic model validation → JSON response → raw data stored in refs (e.g. `allOrders`, `inventoryItems`) → derived data in `computed` properties.

### The filter system
Four filter dimensions apply across the app: **Time Period, Warehouse, Category, Order Status**. All four are passed via query params; backend skips any filter whose value is `'all'` or missing. Category match is case-insensitive; warehouse/status are exact match.

- `month` accepts either a direct month (`2025-03`) or a quarter key (`Q1-2025` … `Q4-2025`), resolved via `QUARTER_MAP` in `server/main.py`.
- Inventory has no time dimension — `month` is not supported on `/api/inventory`.

### Routing (frontend)
`client/src/main.js` defines routes for `/`, `/inventory`, `/orders`, `/demand`, `/spending`, `/reports`. Each maps to a view in `client/src/views/`. Modals live in `client/src/components/`.

### API endpoints
- `GET /api/inventory` — filters: `warehouse`, `category`
- `GET /api/inventory/{id}`
- `GET /api/orders` — filters: `warehouse`, `category`, `status`, `month`
- `GET /api/orders/{id}`
- `GET /api/demand`, `GET /api/backlog` — no filters (backlog joins `has_purchase_order` from `purchase_orders.json`)
- `GET /api/dashboard/summary` — all four filters; computes `total_inventory_value`, `low_stock_items`, `pending_orders`, `total_backlog_items`, `total_orders_value`
- `GET /api/spending/{summary,monthly,categories,transactions}` — no filters
- `GET /api/reports/quarterly`, `GET /api/reports/monthly-trends` — aggregated from orders

Note: `client/src/api.js` references `/api/tasks` and `/api/purchase-orders` endpoints that are not (yet) implemented in `server/main.py`. If you touch those flows, add the endpoints before wiring UI.

## Project-specific gotchas
1. **v-for keys**: never use `index`. Use domain IDs (`sku`, `id`, `month`).
2. **Dates**: always validate (`!isNaN(date.getTime())`) before calling `.getMonth()` / `.getFullYear()`.
3. **Pydantic drift**: when changing the shape of JSON in `server/data/`, update the matching Pydantic model in `server/main.py` — otherwise responses 500 on validation.
4. **Revenue goal constants** used in dashboard/reports math: **$800K per single month**, **$9.6M YTD across all months**. Keep these in sync if the demo data range changes.
5. **Mock data is load-once**: restart the backend after editing any `server/data/*.json`.

## Design system
- Slate/gray palette: `#0f172a` (text), `#64748b` (muted), `#e2e8f0` (borders).
- Status colors: green / blue / yellow / red.
- Layouts: CSS Grid. Charts: hand-rolled SVG.
- **No emojis in UI.**
