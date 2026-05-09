# MegaBuy API Reference

Base URL: `http://localhost:<PORT>`

---

## Category System

### Auto-derived Categories from Product Codes

Categories are automatically derived from product codes. The **first letter** of a product code determines its category.

**Examples:**
| Product Code | Category ID | Category Name |
|--------------|-------------|---------------|
| `T04327` | `T` | Thai |
| `D01699` | `D` | Frozen (Đông lạnh) |
| `J04048` | `J` | Japanese |
| `C08075` | `C` | Chinese |
| `K04053` | `K` | Korean |
| `L04054` | `L` | Lee Kum Kee |
| `V04047` | `V` | Vietnamese |
| `F07001` | `F` | Fruits & Desserts |
| `M07010` | `M` | Monika |
| `N07003` | `N` | Dairy & Non-Food |
| `P01014` | `P` | Philippines |
| `H08005` | `H` | H |
| `I01001` | `I` | I |
| `U01010` | `U` | UK/European |

**Behavior:**

- When importing products via Excel, category is auto-extracted from product code
- When creating a product with a product ID, category is auto-derived if not provided
- Categories are auto-created if they don't exist (using the letter as both ID and name)
- Only alphabetic first characters (A-Z) are recognized as categories

**SQL Sync Script:**
Run `supabase/patch_2026_05_09_sync_categories_from_product_code.sql` to sync categories for all existing products.

---

## Categories

### `GET /api/categories`

Returns all categories.

### `GET /api/categories/:id`

Returns one category by id.

### `POST /api/categories`

Create category.

Body:

```json
{
  "name": "Seafood",
  "description": "Fresh and frozen seafood"
}
```

Validation:

- `name` required
- category name must be unique (case-insensitive)

### `PUT /api/categories/:id`

Update category name/description.

### `DELETE /api/categories/:id`

Delete category.

Rules:

- blocked if products reference this category

---

## Products

### `GET /api/products`

Returns products with resolved `category_name`.

### `GET /api/products/:id`

Returns single product with resolved `category_name`.

### `POST /api/products`

Create product.

Body (unit example):

```json
{
  "id": "T04500",
  "name": "Whole Duck",
  "selling_type": "unit",
  "unit_label": "piece",
  "price": 163
}
```

Body (package example):

```json
{
  "id": "D01700",
  "name": "Coconut Water",
  "selling_type": "package",
  "unit_label": "pack",
  "package_unit": "packs",
  "package_quantity": 24,
  "unit_price": 10.6,
  "price": 254.4
}
```

Validation:

- `name`, `selling_type`, `price` required
- `selling_type` must be `unit` or `package`
- `category_id` is **optional** - auto-derived from product code (first letter) if not provided
- Categories are auto-created if they don't exist

### `PUT /api/products/:id`

Update product.

Rules:

- blocked if product is used in any order with `state = Locked`
- allowed if product is in orders with `Draft`, `Delivered`, or `Closed` state, or not in any order

### `DELETE /api/products/:id`

Delete product.

Rules:

- blocked if product is used in any order with `state = Locked`
- allowed if product is in orders with `Draft`, `Delivered`, or `Closed` state, or not in any order

### `POST /api/products/import`

Import products from Excel/XLSX file.

**Form Data:**

- `file`: Excel file (multipart/form-data)

**Expected Excel Columns (flexible matching):**

- Product Code: `id`, `code`, `Mã SP`, `sku`, etc.
- Name: `name`, `Tên sản phẩm`, etc.
- Brand: `brand`, `Thương hiệu`, etc.
- Price: `price`, `Giá`, `Giá (SEK)`, etc.
- Package Quantity: `packagequantity`, `Quy cách`, etc.
- Unit: `unit`, `Đơn vị`, etc.

**Category Extraction:**

- Categories are auto-extracted from product code (first letter)
- Example: `T04327` → Category `T`
- Categories are auto-created if they don't exist
- Product metadata is updated with the category link

**Response:**

```json
{
  "message": "Import complete: 50 created, 100 updated, 2 skipped",
  "created": 50,
  "updated": 100,
  "skipped": 2,
  "errors": ["Row 5: Invalid price"]
}
```

---

## Orders

### `GET /api/orders`

Return all orders.

### `GET /api/orders/:id`

Return one order by id.

### `POST /api/orders`

Create normal order.

Body:

```json
{
  "person_name": "Ms. Hanh",
  "order_date": "2026-03-19",
  "items": [
    {
      "product_id": "prod_003",
      "quantity": 1,
      "unit": "bag"
    }
  ]
}
```

Rules:

- state is always set to `Draft`
- each item must have valid product/unit/quantity

### `PUT /api/orders/:id`

Edit normal order.

Rules:

- `Draft` orders can be edited
- `Delivered` child orders linked from a Mega order (`locked_by_mega_order_id`) can also be edited
- `mega_buy` orders cannot be edited manually

### `DELETE /api/orders/:id`

Delete order.

Rules:

- `Draft` normal orders can be deleted
- `Closed` Mega orders can be deleted; this also deletes all their child orders
- `Locked` and `Delivered` orders cannot be deleted

---

## Mega Buy Endpoints

### `POST /api/orders/mega-buy`

Create Mega order from all draft normal orders.

Body:

```json
{
  "person_name": "Mega Buy Order",
  "order_date": "2026-03-19"
}
```

Note:

- backend now automatically collects all orders where `state = Draft` and `order_type != mega_buy` and not already assigned to another Mega order
- `source_order_ids` in request is optional and ignored for selection logic
- one normal order can only belong to one Mega order

Rules:

- requires at least 2 draft normal orders in system that are not already assigned to another Mega order

Response includes:

- `order_type: "mega_buy"`
- `child_order_ids` (primary linkage)
- `source_order_ids` (compatibility linkage)
- auto-generated `items`

### `POST /api/orders/:id/recalculate`

Recalculate Mega order quantities/items from all current draft normal orders.

Rules:

- supports `Draft` and `Delivered` Mega orders
- if Mega is `Draft`: server re-selects all orders where `state = Draft` and `order_type != mega_buy` and not already assigned to another Mega order, and requires at least 2
- if Mega is `Delivered`: server recalculates from its own `child_order_ids` and requires all child orders to be `Delivered`

### `POST /api/orders/:id/place`

Place Mega order and lock all child orders.

Note:

- before placing, server automatically recalculates by re-selecting all Draft normal orders not assigned to another Mega order

Rules:

- only `Draft` Mega orders
- requires at least 2 Draft normal orders not already assigned to another Mega order

Effects:

- Mega order: `state = Locked`, `placed_at` set
- Child orders: `state = Locked`, `locked_by_mega_order_id`, `locked_at` set

Response:

```json
{
  "message": "Mega Buy order placed successfully",
  "mega_order_id": "ord_mega",
  "child_order_ids": ["ord_a", "ord_b"],
  "state": "Locked"
}
```

### `POST /api/orders/:id/deliver`

Deliver Mega order and mark all child orders as Delivered.

Rules:

- only `Locked` Mega orders
- child orders must exist and all must be `Locked`

Effects:

- Mega order: `state = Delivered`
- Child orders: `state = Delivered`
- Delivered child orders become editable, but still not deletable

Response:

```json
{
  "message": "Mega Buy order delivered successfully",
  "mega_order_id": "ord_mega",
  "child_order_ids": ["ord_a", "ord_b"],
  "state": "Delivered"
}
```

### `POST /api/orders/:id/unlock` (Hidden)

Unlock a Locked Mega order and return it and all child orders to Draft state.

Rules:

- only `Locked` Mega orders (cannot unlock Delivered, Closed, or Draft orders)
- only Mega Buy orders (cannot unlock normal orders)
- child orders must exist and all must be `Locked`

Effects:

- Mega order: `state = Draft`, `placed_at` cleared
- Child orders: `state = Draft`, `locked_by_mega_order_id` and `locked_at` cleared

Response:

```json
{
  "message": "Mega Buy order unlocked successfully",
  "mega_order_id": "ord_mega",
  "child_order_ids": ["ord_a", "ord_b"],
  "state": "Draft"
}
```

### `POST /api/orders/:id/close`

Close Delivered Mega order and close all child orders.

Rules:

- only `Delivered` Mega orders
- child orders must exist and all must be `Delivered`

Effects:

- Mega order: `state = Closed`
- Child orders: `state = Closed`
- child orders move to Archived section in UI and remain readonly (no Edit/Delete)
- Closed Mega order shows Delete button in UI

Response:

```json
{
  "message": "Mega Buy order closed successfully",
  "mega_order_id": "ord_mega",
  "child_order_ids": ["ord_a", "ord_b"],
  "state": "Closed"
}
```

---

## Favorite List

### `GET /api/favorite-list`

Returns all favorite list items with product details.

Response:

```json
[
  {
    "id": 1,
    "product_id": "T04327",
    "added_by": "User",
    "note": "For next order",
    "created_at": "2026-05-09T...",
    "product": { "id": "T04327", "name": "..." }
  }
]
```

### `POST /api/favorite-list`

Add product to favorite list.

Body:

```json
{
  "product_id": "T04327",
  "added_by": "User",
  "note": "Optional note"
}
```

### `DELETE /api/favorite-list/:productId`

Remove product from favorite list.

### `DELETE /api/favorite-list`

Clear entire favorite list.

---

## Delivery Status

### `GET /api/delivery-status/:megaOrderId`

Get delivery status for all items in a mega order.

Response:

```json
{
  "ord_child1:T04327": "delivered",
  "ord_child1:D01699": "none"
}
```

### `POST /api/delivery-status`

Update delivery status for a specific item.

Body:

```json
{
  "megaOrderId": "ord_mega",
  "childOrderId": "ord_child1",
  "productId": "T04327",
  "status": "delivered"
}
```

Status values: `"none"`, `"delivered"`

---

## Payment Status

### `GET /api/payment-status/:megaOrderId`

Get payment status for all child orders in a mega order.

Response:

```json
{
  "ord_child1": true,
  "ord_child2": false
}
```

### `POST /api/payment-status`

Update payment status for a child order.

Body:

```json
{
  "megaOrderId": "ord_mega",
  "childOrderId": "ord_child1",
  "paid": true
}
```

---

## Discount Products

### `GET /api/discount-products`

Returns all discount products with product details.

Response:

```json
[
  {
    "id": 1,
    "product_id": "T04327",
    "product_name": "Fish Sauce",
    "original_price": 45.5,
    "discount_price": 39.9,
    "package_quantity": 12,
    "unit_label": "bottle",
    "note": "May sale",
    "created_at": "2026-05-09T..."
  }
]
```

### `POST /api/discount-products`

Add or update discount for a product.

Body:

```json
{
  "product_id": "T04327",
  "discount_price": 39.9,
  "note": "May sale"
}
```

### `DELETE /api/discount-products/:productId`

Remove discount from a product.

### `DELETE /api/discount-products`

Clear all discounts.

---

## Admin

### `POST /api/admin/bulk-update-items`

Bulk update order items across multiple orders.

Body:

```json
{
  "edits": [
    {
      "orderId": "ord_1",
      "productId": "T04327",
      "quantity": 5,
      "unit": "unit"
    },
    { "orderId": "ord_2", "productId": "D01699", "quantity": 2 }
  ]
}
```

Response:

```json
{
  "message": "3 items updated, 0 failed",
  "successCount": 3,
  "failCount": 0,
  "results": [...]
}
```

### `PATCH /api/admin/orders/:orderId/items/:productId`

Update a single order item quantity.

Body:

```json
{
  "quantity": 5,
  "unit": "carton"
}
```

---

## Common Error Responses

- `400` for validation/business rule failures
- `404` for missing resources

Format:

```json
{
  "error": "Human-readable error message"
}
```
