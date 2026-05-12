# MegaBuy

MegaBuy is a product and order management app built with Express backend and React + TypeScript frontend, using Supabase for data storage.

It supports:

- Category and product management
- Draft/Locked/Delivered/Closed order lifecycle
- Mega Buy order generation from all draft normal orders
- Carton-aware quantity aggregation and recalculation
- Locking a Mega order and all children in one action
- Archived order view (collapsed by default)

---

## Tech Stack

- **Backend:** Node.js, Express, body-parser
- **Frontend:** React 19, TypeScript, Vite
- **Database:** Supabase (PostgreSQL)

---

## Project Structure

```text
MegaBuy/
├── backend/
│   ├── server.js              # Entry point (~40 lines)
│   ├── api/
│   │   └── index.js           # Vercel serverless handler
│   ├── lib/
│   │   ├── supabase.js        # Supabase client
│   │   ├── products.js        # Product data access
│   │   └── orders.js          # Order data access
│   ├── routes/
│   │   ├── categories.js      # /api/categories
│   │   ├── products.js        # /api/products
│   │   ├── orders.js          # /api/orders
│   │   ├── admin.js           # /api/admin
│   │   ├── favoriteList.js    # /api/favorite-list
│   │   ├── deliveryStatus.js  # /api/delivery-status
│   │   ├── paymentStatus.js   # /api/payment-status
│   │   └── discountProducts.js # /api/discount-products
│   └── utils/
│       ├── pricing.js         # Pricing & aggregation logic
│       └── categories.js      # Category helpers
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── context/
│   │   ├── types/
│   │   ├── utils/
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── index.html
│   ├── vite.config.ts
│   └── tsconfig.json
├── data/
│   ├── catalog.json
│   └── orders.json
├── docs/
│   ├── API_REFERENCE.md
│   └── ORDER_MEGA_BUY_LOGIC.md
├── public/
├── supabase/
│   ├── migration.sql
│   └── seed.sql
└── package.json
```

---

## Setup

### 1. Install dependencies

```powershell
npm install
cd frontend && npm install
```

### 2. Configure environment

Copy `.env.example` to `.env` and fill in your Supabase credentials:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
DATABASE_URL=postgresql://postgres.your-project:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
```

**Finding your credentials:**

- **SUPABASE_URL**: Project Settings → API → Project URL
- **SUPABASE_SERVICE_ROLE_KEY**: Project Settings → API → `service_role` key (keep secret!)
- **DATABASE_URL**: Project Settings → Database → Connection string → URI (use **Session pooler**, port 6543)

### 3. Run database migrations

```powershell
npm run migrate
```

To see migration status:

```powershell
npm run migrate:list
```

### 4. Start backend server

```powershell
npm run server
```

### 5. Start frontend dev server

```powershell
cd frontend && npm run dev
```

### 6. Open the app

- Frontend: http://localhost:5173 (proxies API to backend)
- Backend API: http://localhost:3000

### Port Conflicts

If port 3000 is in use:

```powershell
$env:PORT="3100"
npm run server
```

Then update `frontend/vite.config.ts` proxy target accordingly.

---

## Core Features

### Categories

- Create, list, update, delete
- Unique name enforcement (case-insensitive)
- Cannot delete category if products still reference it

### Products

- Create, list, update, delete
- Supports `selling_type` = `unit` or `package`
- Package products support carton + small-unit pricing
- Cannot delete products that are used by any order item

### Orders

- Create standard customer orders
- Order states: `Draft` → `Locked` → `Delivered` → `Closed`
- `Draft` orders can be edited/deleted
- `Delivered` child orders (from Mega Buy) can be edited

### Mega Buy Orders

- Create from all draft normal orders (`state = Draft`, `order_type != mega_buy`)
- Auto-aggregates quantities across child orders
- Package items are rounded to cartons with remainder handling
- Stores child links in:
  - `child_order_ids` (primary)
  - `source_order_ids` (compatibility)
- Supports:
  - `Recalculate`: regenerate items from child orders (Draft or Delivered)
  - `Place Order`: locks Mega order + all child orders (Draft only)
  - `Deliver Order`: marks Mega + children as Delivered (Locked only)
  - `Close Order`: archives Mega + children (Delivered only)

### Archived Orders UI

- In Orders tab, archived sections are collapsed by default
- Archived Mega Orders: contains `Closed` Mega orders
- Archived Orders: contains `Closed` normal/child orders
- Closed Mega orders can be deleted (also deletes child orders)

---

## Important Data Fields

### Normal Order

```json
{
  "id": "ord_...",
  "person_name": "Ms Huong Meo",
  "order_date": "2026-03-19",
  "state": "Draft",
  "items": [],
  "total_amount": 1505.2,
  "locked_by_mega_order_id": null,
  "locked_at": null,
  "created_at": "...",
  "updated_at": "..."
}
```

### Mega Buy Order

```json
{
  "id": "ord_...",
  "person_name": "Mega Buy Order",
  "order_type": "mega_buy",
  "state": "Draft",
  "child_order_ids": ["ord_a", "ord_b"],
  "source_order_ids": ["ord_a", "ord_b"],
  "immutable_items": true,
  "items": [],
  "total_amount": 3097.2,
  "placed_at": null,
  "delivered_at": null
}
```

### Child Order Lock Metadata (after Place)

```json
{
  "state": "Locked",
  "locked_by_mega_order_id": "ord_mega...",
  "locked_at": "2026-03-19T13:29:05.016Z"
}
```

---

## API Summary

### Categories

- `GET /api/categories`
- `GET /api/categories/:id`
- `POST /api/categories`
- `PUT /api/categories/:id`
- `DELETE /api/categories/:id`

### Products

- `GET /api/products`
- `GET /api/products/:id`
- `POST /api/products`
- `PUT /api/products/:id`
- `DELETE /api/products/:id`

### Orders

- `GET /api/orders`
- `GET /api/orders/:id`
- `POST /api/orders`
- `PUT /api/orders/:id`
- `DELETE /api/orders/:id`
- `POST /api/orders/mega-buy`
- `POST /api/orders/:id/recalculate`
- `POST /api/orders/:id/place`
- `POST /api/orders/:id/deliver`
- `POST /api/orders/:id/close`

For full request/response details, see `docs/API_REFERENCE.md`.

---

## Detailed Logic Docs

- `docs/ORDER_MEGA_BUY_LOGIC.md`: lifecycle, locking rules, aggregation logic, archive behavior
- `docs/API_REFERENCE.md`: endpoint contracts and examples

---

## Notes

- Data is stored in Supabase (PostgreSQL).
- Timestamps are ISO-8601 strings.
- The frontend uses Vite's proxy to forward `/api` requests to the backend during development.
