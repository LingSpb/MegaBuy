# MegaBuy

MegaBuy is a lightweight product and order management app built with `Express` + vanilla JavaScript, using JSON file storage (`data/store.json`).

It supports:
- Category and product management
- Draft/Locked/Closed order lifecycle
- Mega Buy order generation from all draft normal orders
- Carton-aware quantity aggregation and recalculation
- Locking a Mega order and both children in one action
- Archived order view (collapsed by default)

---

## Tech Stack

- **Backend:** `Node.js`, `Express`, `body-parser`
- **Frontend:** `HTML`, `CSS`, vanilla `JavaScript`
- **Storage:** flat JSON file at `data/store.json`

---

## Project Structure

```text
MegaBuy/
├── server.js
├── package.json
├── data/
│   └── store.json
├── public/
│   ├── index.html
│   ├── styles.css
│   └── app.js
└── docs/
    ├── API_REFERENCE.md
    └── ORDER_MEGA_BUY_LOGIC.md
```

---

## Setup

1. Install dependencies:

```powershell
npm install
```

2. Start server:

```powershell
npm start
```

3. Open:

```text
http://localhost:3000
```

### If `npm start` exits with code 1

This is typically a port conflict on `3000`. Run on another port:

```powershell
$env:PORT="3100"
npm start
```

Then open:

```text
http://localhost:3100
```

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
- Order default state is always `Draft`
- Only `Draft` orders can be edited/deleted

### Mega Buy Orders
- Create from all draft normal orders (`state = Draft`, `order_type != mega_buy`)
- Auto-aggregates quantities across child orders
- Package items are rounded to cartons with remainder handling
- Stores child links in:
  - `child_order_ids` (primary)
  - `source_order_ids` (compatibility)
- Supports:
  - `Recalculate` (draft-only)
  - `Place Order` (draft-only): locks Mega order + all child orders

### Archived Orders UI
- In Orders tab, archived section is collapsed by default
- Contains only locked/closed **normal** orders
- Locked Mega orders stay in main list for visibility

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
  "total_amount": 3097.2
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

For full request/response details, see `docs/API_REFERENCE.md`.

---

## Detailed Logic Docs

- `docs/ORDER_MEGA_BUY_LOGIC.md`: lifecycle, locking rules, aggregation logic, archive behavior
- `docs/API_REFERENCE.md`: endpoint contracts and examples

---

## Notes

- Data persistence is file-based and synchronous (`fs.readFileSync`/`fs.writeFileSync`).
- Timestamps are ISO-8601 strings.
- This project is intentionally simple and optimized for local/internal workflows.
