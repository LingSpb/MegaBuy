# Order & Mega Buy Logic

This document explains how order state transitions and Mega Buy behavior work in MegaBuy.

---

## 1) Order States

- `Draft`: editable/deletable state
- `Locked`: immutable operational state after placement
- `Closed`: reserved terminal state for completed processes

Current enforced rules in API:
- create order => always `Draft`
- edit order => only if `Draft`
- delete order => only if `Draft`

---

## 2) Normal Order vs Mega Order

### Normal order
- no `order_type` field
- manually created from order form

### Mega order
- `order_type: "mega_buy"`
- `immutable_items: true`
- items are system-generated from child orders
- child links are stored in:
  - `child_order_ids` (main field)
  - `source_order_ids` (compatibility field)

---

## 3) Mega Buy Creation Rules

When `POST /api/orders/mega-buy` is called:

1. server scans all orders and selects every order with:
  - `state = Draft`
  - `order_type != mega_buy`
2. at least 2 such orders must exist
3. selected orders become Mega children

If all checks pass, the server aggregates item quantities and builds one Mega order.

---

## 4) Quantity Aggregation Logic

Aggregation groups by `product_id` across the two child orders.

### For package products
- convert all quantities to the product’s small unit
- compute:
  - cartons = `floor(totalSmallUnits / package_quantity)`
  - remainder = `totalSmallUnits % package_quantity`
- output up to 2 lines:
  - carton line (if cartons > 0)
  - small-unit line (if remainder > 0)

### For unit products
- sum by normalized unit key
- produce merged lines by unit

Line totals and order totals are recomputed from current product prices.

---

## 5) Recalculate Behavior

`POST /api/orders/:id/recalculate`

Allowed only when Mega order is `Draft`.

Validation:
- order exists and is `mega_buy`
- server re-selects all current orders where `state = Draft` and `order_type != mega_buy`
- at least 2 draft normal orders must exist

Then items + total are regenerated and Mega order linkage is updated to this latest Draft set.

---

## 6) Place Order Behavior

`POST /api/orders/:id/place`

Allowed only for `Draft` Mega orders.

If valid:
- each child order is updated:
  - `state = Locked`
  - `locked_by_mega_order_id = <mega_id>`
  - `locked_at = <timestamp>`
- Mega order is updated:
  - `state = Locked`
  - `placed_at = <timestamp>`

This operation locks the Mega order and all its child orders together.

---

## 7) Archived UI Behavior

Orders screen is split into:

### Main area
- all `Draft` orders
- all Mega orders (including locked Mega orders)

### Archived area (collapsed by default)
- non-draft **normal** orders only
- this means locked child orders move to archive after placing Mega

The archive panel expands on click and can auto-expand during search when archived matches exist.

---

## 8) Important Backward Compatibility Note

Older Mega orders may only contain `source_order_ids`.

The backend now resolves child IDs by:
1. `child_order_ids` first
2. fallback to `source_order_ids`

When recalculating/placing, both fields are synchronized.
