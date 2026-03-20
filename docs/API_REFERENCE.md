# MegaBuy API Reference

Base URL: `http://localhost:<PORT>`

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
  "name": "Whole Duck",
  "category_id": "cat_meat",
  "selling_type": "unit",
  "unit_label": "piece",
  "price": 163
}
```

Body (package example):

```json
{
  "name": "Coconut Water",
  "category_id": "cat_drinks",
  "selling_type": "package",
  "unit_label": "pack",
  "package_unit": "packs",
  "package_quantity": 24,
  "unit_price": 10.6,
  "price": 254.4
}
```

Validation:
- `name`, `category_id`, `selling_type`, `price` required
- `selling_type` must be `unit` or `package`
- `category_id` must exist

### `PUT /api/products/:id`
Update product.

### `DELETE /api/products/:id`
Delete product.

Rules:
- blocked if any order item references that product

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
- only `Draft` orders can be edited
- `mega_buy` orders cannot be edited manually

### `DELETE /api/orders/:id`
Delete order.

Rules:
- only `Draft` orders can be deleted

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
- backend now automatically collects all orders where `state = Draft` and `order_type != mega_buy`
- `source_order_ids` in request is optional and ignored for selection logic

Rules:
- requires at least 2 draft normal orders in system

Response includes:
- `order_type: "mega_buy"`
- `child_order_ids` (primary linkage)
- `source_order_ids` (compatibility linkage)
- auto-generated `items`

### `POST /api/orders/:id/recalculate`
Recalculate Mega order quantities/items from all current draft normal orders.

Rules:
- only `Draft` Mega orders
- server re-selects all orders where `state = Draft` and `order_type != mega_buy`
- at least 2 draft normal orders are required

### `POST /api/orders/:id/place`
Place Mega order and lock all child orders.

Rules:
- only `Draft` Mega orders
- child orders must exist and all must be `Draft`

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
