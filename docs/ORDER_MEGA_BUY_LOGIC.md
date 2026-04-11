# Order & Mega Buy Logic

This document explains how order state transitions and Mega Buy behavior work in MegaBuy.

---

## 1) Order States

- `Draft`: editable/deletable state
- `Locked`: immutable operational state after placement (before delivery)
- `Delivered`: delivered state (not deletable)
- `Closed`: reserved terminal state for completed processes

Current enforced rules in API:
- create order => always `Draft`
- edit order => if `Draft`, or if normal order is `Delivered` and linked as Mega child (`locked_by_mega_order_id`)
- delete order => if `Draft`, or if order is a `Closed` Mega order (which also deletes its child orders)

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

Allowed when Mega order is `Draft` or `Delivered`.

Validation:
- order exists and is `mega_buy`
- if Mega is `Draft`:
  - server re-selects all current orders where `state = Draft` and `order_type != mega_buy`
  - at least 2 draft normal orders must exist
- if Mega is `Delivered`:
  - server recalculates from that Mega order's own `child_order_ids`
  - all child orders must be in `Delivered` state

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

## 7) Deliver Order Behavior

`POST /api/orders/:id/deliver`

Allowed only for `Locked` Mega orders.

If valid:
- each child order is updated:
  - `state = Delivered`
  - `updated_at = <timestamp>`
- Mega order is updated:
  - `state = Delivered`
  - `updated_at = <timestamp>`

Effects:
- delivered child orders can be edited
- delivered orders (child and mega) cannot be deleted

---

## 8) Close Order Behavior

`POST /api/orders/:id/close`

Allowed only for `Delivered` Mega orders.

If valid:
- each child order is updated:
  - `state = Closed`
  - `updated_at = <timestamp>`
- Mega order is updated:
  - `state = Closed`
  - `updated_at = <timestamp>`

Effects:
- closed Mega order moves to Archived Mega Orders section
- closed child orders move to Archived Orders section
- closed child orders remain readonly (no Edit/Delete)
- Closed Mega order can be deleted from UI

---

## 9) Archived UI Behavior

Orders screen is split into:

### Main area
- normal orders except `Closed`
- Mega orders except `Closed` (sorted by updated date desc)

### Archived Mega Orders (collapsed by default)
- `Closed` Mega orders (sorted by updated date desc)
- Closed Mega orders can be deleted from UI

### Archived Orders (collapsed by default)
- `Closed` normal child orders (sorted by updated date desc)
- child orders move to archive after closing Mega

The archive panels expand on click and can auto-expand during search when archived matches exist.

---

## 10) Important Backward Compatibility Note

Older Mega orders may only contain `source_order_ids`.

The backend now resolves child IDs by:
1. `child_order_ids` first
2. fallback to `source_order_ids`

When recalculating/placing, both fields are synchronized.
