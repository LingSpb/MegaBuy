/**
 * Order routes for MegaBuy
 */

const express = require("express");
const router = express.Router();
const supabase = require("../lib/supabase");
const { fetchProducts } = require("../lib/products");
const {
  fetchOrders,
  fetchOrderById,
  saveOrderItems,
} = require("../lib/orders");
const {
  normalizeUnit,
  buildProductUnits,
  getProductUnitPrice,
  hydrateOrderPricing,
  aggregateMegaBuyItems,
  getMegaChildOrderIds,
} = require("../utils/pricing");

// Get all orders
router.get("/", async (req, res) => {
  try {
    const orders = await fetchOrders();
    const products = await fetchProducts();
    const hydrated = orders.map((order) =>
      hydrateOrderPricing(order, products),
    );
    res.json(hydrated);
  } catch (error) {
    res.status(500).json({ error: "Failed to load orders: " + error.message });
  }
});

// Get order by ID
router.get("/:id", async (req, res) => {
  try {
    const order = await fetchOrderById(req.params.id);
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }
    const products = await fetchProducts();
    const hydrated = hydrateOrderPricing(order, products);
    const { secret_phrase, ...orderResponse } = hydrated;
    res.json({
      ...orderResponse,
      has_secret_phrase: Boolean(secret_phrase),
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to load order: " + error.message });
  }
});

// Create new order
router.post("/", async (req, res) => {
  const { person_name, order_date, secret_phrase, items } = req.body;

  if (!person_name || person_name.trim() === "") {
    return res.status(400).json({ error: "Person name is required" });
  }

  if (!Array.isArray(items) || items.length === 0) {
    return res
      .status(400)
      .json({ error: "Order must include at least one item" });
  }

  try {
    // Check for duplicate person name (case-insensitive, only for normal orders)
    const { data: existingOrders } = await supabase
      .from("orders")
      .select("id, person_name")
      .ilike("person_name", person_name.trim())
      .is("order_type", null);

    if (existingOrders && existingOrders.length > 0) {
      return res.status(400).json({
        error: `An order for "${person_name.trim()}" already exists`,
      });
    }

    const products = await fetchProducts();
    const orderItems = [];
    let orderTotal = 0;

    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      const quantity = Number(item.quantity);
      const unit = normalizeUnit(item.unit);
      const product = products.find((p) => p.id === item.product_id);

      if (!product) {
        return res
          .status(400)
          .json({ error: `Product not found at line ${index + 1}` });
      }

      if (!quantity || quantity <= 0) {
        return res.status(400).json({
          error: `Quantity must be greater than 0 at line ${index + 1}`,
        });
      }

      if (!unit) {
        return res
          .status(400)
          .json({ error: `Unit is required at line ${index + 1}` });
      }

      const allowedUnits = buildProductUnits(product);
      if (!allowedUnits.includes(unit)) {
        return res.status(400).json({
          error: `Unit '${item.unit}' is not valid for ${product.name}. Allowed units: ${allowedUnits.join(", ")}`,
        });
      }

      const unitPrice = getProductUnitPrice(product, unit);
      const lineTotal =
        unitPrice !== null ? Number((unitPrice * quantity).toFixed(2)) : null;

      if (lineTotal !== null) {
        orderTotal += lineTotal;
      }

      orderItems.push({
        product_id: product.id,
        product_name: product.name,
        quantity,
        unit,
        unit_price: unitPrice,
        line_total: lineTotal,
      });
    }

    const orderId = `ord_${Date.now()}`;
    const now = new Date().toISOString();

    const newOrder = {
      id: orderId,
      person_name: person_name.trim(),
      order_date: order_date || new Date().toISOString().split("T")[0],
      state: "Draft",
      secret_phrase: secret_phrase || null,
      total_amount: Number(orderTotal.toFixed(2)),
      created_at: now,
      updated_at: now,
    };

    const { data: savedOrder, error: orderError } = await supabase
      .from("orders")
      .insert(newOrder)
      .select()
      .single();

    if (orderError) throw orderError;

    await saveOrderItems(orderId, orderItems);

    const { secret_phrase: _, ...orderResponse } = savedOrder;
    res.status(201).json({
      ...orderResponse,
      has_secret_phrase: Boolean(savedOrder.secret_phrase),
      items: orderItems,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to create order: " + error.message });
  }
});

// Update order
router.put("/:id", async (req, res) => {
  const { person_name, order_date, items } = req.body;

  try {
    const order = await fetchOrderById(req.params.id);

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    if (order.order_type === "mega_buy") {
      return res.status(400).json({
        error:
          "Mega Buy order product list and quantity are auto-generated and cannot be edited manually",
      });
    }

    const isEditableDeliveredChild =
      order.state === "Delivered" && Boolean(order.locked_by_mega_order_id);
    if (order.state !== "Draft" && !isEditableDeliveredChild) {
      return res.status(400).json({
        error:
          "Only Draft orders and Delivered child orders from a Mega Buy can be edited",
      });
    }

    if (!person_name || person_name.trim() === "") {
      return res.status(400).json({ error: "Person name is required" });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res
        .status(400)
        .json({ error: "Order must include at least one item" });
    }

    const products = await fetchProducts();
    const orderItems = [];
    let orderTotal = 0;

    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      const quantity = Number(item.quantity);
      const unit = normalizeUnit(item.unit);
      const product = products.find((p) => p.id === item.product_id);

      if (!product) {
        return res
          .status(400)
          .json({ error: `Product not found at line ${index + 1}` });
      }

      if (!quantity || quantity <= 0) {
        return res.status(400).json({
          error: `Quantity must be greater than 0 at line ${index + 1}`,
        });
      }

      if (!unit) {
        return res
          .status(400)
          .json({ error: `Unit is required at line ${index + 1}` });
      }

      const allowedUnits = buildProductUnits(product);
      if (!allowedUnits.includes(unit)) {
        return res.status(400).json({
          error: `Unit '${item.unit}' is not valid for ${product.name}. Allowed units: ${allowedUnits.join(", ")}`,
        });
      }

      const unitPrice = getProductUnitPrice(product, unit);
      const lineTotal =
        unitPrice !== null ? Number((unitPrice * quantity).toFixed(2)) : null;

      if (lineTotal !== null) {
        orderTotal += lineTotal;
      }

      orderItems.push({
        product_id: product.id,
        product_name: product.name,
        quantity,
        unit,
        unit_price: unitPrice,
        line_total: lineTotal,
      });
    }

    const now = new Date().toISOString();
    const { data: updatedOrder, error: updateError } = await supabase
      .from("orders")
      .update({
        person_name: person_name.trim(),
        order_date: order_date || order.order_date,
        total_amount: Number(orderTotal.toFixed(2)),
        updated_at: now,
      })
      .eq("id", req.params.id)
      .select()
      .single();

    if (updateError) throw updateError;

    await saveOrderItems(req.params.id, orderItems);

    const { secret_phrase: _, ...orderResponse } = updatedOrder;
    res.json({
      ...orderResponse,
      has_secret_phrase: Boolean(updatedOrder.secret_phrase),
      items: orderItems,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to update order: " + error.message });
  }
});

// Create Mega Buy order
router.post("/mega-buy", async (req, res) => {
  try {
    const allOrders = await fetchOrders();
    const products = await fetchProducts();

    // Hydrate all orders for proper pricing
    const hydratedOrders = allOrders.map((o) =>
      hydrateOrderPricing(o, products),
    );

    // Get all order IDs that are already assigned to a mega order
    const assignedOrderIds = new Set();
    hydratedOrders.forEach((o) => {
      if (o.order_type === "mega_buy" && Array.isArray(o.child_order_ids)) {
        o.child_order_ids.forEach((id) => assignedOrderIds.add(id));
      }
    });

    const sourceOrders = hydratedOrders.filter(
      (order) =>
        order.state === "Draft" &&
        order.order_type !== "mega_buy" &&
        !assignedOrderIds.has(order.id),
    );

    if (sourceOrders.length < 2) {
      return res.status(400).json({
        error:
          "Mega Buy requires at least 2 Draft normal orders that are not already assigned to another Mega order",
      });
    }

    const sourceOrderIds = sourceOrders.map((order) => order.id);

    let aggregated;
    try {
      aggregated = aggregateMegaBuyItems(products, sourceOrders);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    const orderId = `ord_${Date.now()}`;
    const now = new Date().toISOString();

    const megaOrder = {
      id: orderId,
      person_name: req.body.person_name || "Mega Buy Order",
      order_date: req.body.order_date || new Date().toISOString().split("T")[0],
      state: "Draft",
      order_type: "mega_buy",
      child_order_ids: sourceOrderIds,
      source_order_ids: sourceOrderIds,
      immutable_items: true,
      total_amount: aggregated.total_amount,
      created_at: now,
      updated_at: now,
    };

    const { data: savedOrder, error: orderError } = await supabase
      .from("orders")
      .insert(megaOrder)
      .select()
      .single();

    if (orderError) throw orderError;

    await saveOrderItems(orderId, aggregated.items);

    const { secret_phrase, ...orderResponse } = savedOrder;
    res.status(201).json({
      ...orderResponse,
      has_secret_phrase: Boolean(secret_phrase),
      items: aggregated.items,
    });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to create Mega Buy order: " + error.message });
  }
});

// Recalculate Mega Buy order
router.post("/:id/recalculate", async (req, res) => {
  try {
    const order = await fetchOrderById(req.params.id);

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    if (order.order_type !== "mega_buy") {
      return res
        .status(400)
        .json({ error: "Only Mega Buy orders can be recalculated" });
    }

    if (!["Draft", "Delivered"].includes(order.state)) {
      return res.status(400).json({
        error: "Only Draft or Delivered Mega Buy orders can be recalculated",
      });
    }

    const allOrders = await fetchOrders();
    const products = await fetchProducts();
    const hydratedOrders = allOrders.map((o) =>
      hydrateOrderPricing(o, products),
    );

    let sourceOrders = [];
    let childOrderIds = [];

    if (order.state === "Draft") {
      // Get all order IDs that are already assigned to another mega order (not this one)
      const assignedOrderIds = new Set();
      hydratedOrders.forEach((o) => {
        if (
          o.order_type === "mega_buy" &&
          o.id !== order.id &&
          Array.isArray(o.child_order_ids)
        ) {
          o.child_order_ids.forEach((id) => assignedOrderIds.add(id));
        }
      });

      sourceOrders = hydratedOrders.filter(
        (item) =>
          item.state === "Draft" &&
          item.order_type !== "mega_buy" &&
          !assignedOrderIds.has(item.id),
      );

      if (sourceOrders.length < 2) {
        return res.status(400).json({
          error:
            "Mega Buy recalculation requires at least 2 Draft normal orders that are not already assigned to another Mega order",
        });
      }

      childOrderIds = sourceOrders.map((item) => item.id);
    } else {
      childOrderIds = getMegaChildOrderIds(order);

      if (childOrderIds.length === 0) {
        return res.status(400).json({
          error:
            "Delivered Mega Buy order has no child orders to recalculate from",
        });
      }

      sourceOrders = hydratedOrders.filter(
        (item) =>
          childOrderIds.includes(item.id) &&
          item.order_type !== "mega_buy" &&
          item.state === "Delivered",
      );

      if (sourceOrders.length !== childOrderIds.length) {
        return res.status(400).json({
          error:
            "All child orders must be in Delivered state before recalculating a Delivered Mega Buy order",
        });
      }
    }

    let aggregated;
    try {
      aggregated = aggregateMegaBuyItems(products, sourceOrders);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    const now = new Date().toISOString();
    const { data: updatedOrder, error: updateError } = await supabase
      .from("orders")
      .update({
        total_amount: aggregated.total_amount,
        child_order_ids: childOrderIds,
        source_order_ids: childOrderIds,
        updated_at: now,
      })
      .eq("id", req.params.id)
      .select()
      .single();

    if (updateError) throw updateError;

    await saveOrderItems(req.params.id, aggregated.items);

    const { secret_phrase, ...orderResponse } = updatedOrder;
    res.json({
      ...orderResponse,
      has_secret_phrase: Boolean(secret_phrase),
      items: aggregated.items,
    });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to recalculate order: " + error.message });
  }
});

// Place Mega Buy order
router.post("/:id/place", async (req, res) => {
  try {
    const order = await fetchOrderById(req.params.id);

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    if (order.order_type !== "mega_buy") {
      return res
        .status(400)
        .json({ error: "Only Mega Buy orders can be placed with this action" });
    }

    if (order.state !== "Draft") {
      return res
        .status(400)
        .json({ error: "Only Draft Mega Buy orders can be placed" });
    }

    // Recalculate mega order before placing - re-select all Draft normal orders not assigned to another mega order
    const allOrders = await fetchOrders();
    const products = await fetchProducts();
    const hydratedOrders = allOrders.map((o) =>
      hydrateOrderPricing(o, products),
    );

    // Get all order IDs that are already assigned to another mega order (not this one)
    const assignedOrderIds = new Set();
    hydratedOrders.forEach((o) => {
      if (
        o.order_type === "mega_buy" &&
        o.id !== order.id &&
        Array.isArray(o.child_order_ids)
      ) {
        o.child_order_ids.forEach((id) => assignedOrderIds.add(id));
      }
    });

    const sourceOrders = hydratedOrders.filter(
      (item) =>
        item.state === "Draft" &&
        item.order_type !== "mega_buy" &&
        !assignedOrderIds.has(item.id),
    );

    if (sourceOrders.length < 2) {
      return res.status(400).json({
        error:
          "Mega Buy order requires at least 2 Draft normal orders that are not already assigned to another Mega order",
      });
    }

    const childOrderIds = sourceOrders.map((item) => item.id);

    // Aggregate items from source orders
    let aggregated;
    try {
      aggregated = aggregateMegaBuyItems(products, sourceOrders);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    const now = new Date().toISOString();

    // Lock all child orders
    for (const childOrder of sourceOrders) {
      const { error: lockError } = await supabase
        .from("orders")
        .update({
          state: "Locked",
          locked_by_mega_order_id: order.id,
          locked_at: now,
          updated_at: now,
        })
        .eq("id", childOrder.id);

      if (lockError) throw lockError;
    }

    // Update and lock the mega order with recalculated items
    const { error: megaLockError } = await supabase
      .from("orders")
      .update({
        state: "Locked",
        total_amount: aggregated.total_amount,
        child_order_ids: childOrderIds,
        source_order_ids: childOrderIds,
        placed_at: now,
        updated_at: now,
      })
      .eq("id", req.params.id);

    if (megaLockError) throw megaLockError;

    // Save recalculated items
    await saveOrderItems(req.params.id, aggregated.items);

    res.json({
      message: "Mega Buy order placed successfully",
      mega_order_id: order.id,
      child_order_ids: childOrderIds,
      state: "Locked",
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to place order: " + error.message });
  }
});

// Deliver Mega Buy order
router.post("/:id/deliver", async (req, res) => {
  try {
    const order = await fetchOrderById(req.params.id);

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    if (order.order_type !== "mega_buy") {
      return res.status(400).json({
        error: "Only Mega Buy orders can be delivered with this action",
      });
    }

    if (order.state !== "Locked") {
      return res
        .status(400)
        .json({ error: "Only Locked Mega Buy orders can be delivered" });
    }

    const childOrderIds = getMegaChildOrderIds(order);

    if (childOrderIds.length < 2) {
      return res
        .status(400)
        .json({ error: "Mega Buy order has invalid source orders" });
    }

    const { data: sourceOrders, error: fetchError } = await supabase
      .from("orders")
      .select("*")
      .in("id", childOrderIds);

    if (fetchError) throw fetchError;

    if (sourceOrders.length !== childOrderIds.length) {
      return res
        .status(400)
        .json({ error: "One or more source orders no longer exist" });
    }

    if (sourceOrders.some((item) => item.order_type === "mega_buy")) {
      return res
        .status(400)
        .json({ error: "Mega Buy order cannot have Mega Buy child orders" });
    }

    if (sourceOrders.some((item) => item.state !== "Locked")) {
      return res.status(400).json({
        error:
          "All child orders must be Locked before delivering Mega Buy order",
      });
    }

    const now = new Date().toISOString();

    for (const childOrder of sourceOrders) {
      const { error: deliverError } = await supabase
        .from("orders")
        .update({
          state: "Delivered",
          updated_at: now,
          delivered_at: now,
        })
        .eq("id", childOrder.id);

      if (deliverError) throw deliverError;
    }

    const { error: megaDeliverError } = await supabase
      .from("orders")
      .update({
        state: "Delivered",
        child_order_ids: childOrderIds,
        source_order_ids: childOrderIds,
        updated_at: now,
        delivered_at: now,
      })
      .eq("id", req.params.id);

    if (megaDeliverError) throw megaDeliverError;

    res.json({
      message: "Mega Buy order delivered successfully",
      mega_order_id: order.id,
      child_order_ids: childOrderIds,
      state: "Delivered",
    });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to deliver order: " + error.message });
  }
});

// Hidden unlock endpoint - returns Locked Mega order and its children to Draft state
router.get("/:id/unlock", async (req, res) => {
  try {
    const order = await fetchOrderById(req.params.id);

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    if (order.order_type !== "mega_buy") {
      return res
        .status(400)
        .json({ error: "Only Mega Buy orders can be unlocked" });
    }

    if (order.state !== "Locked") {
      return res
        .status(400)
        .json({ error: "Only Locked Mega Buy orders can be unlocked" });
    }

    const childOrderIds = getMegaChildOrderIds(order);

    if (childOrderIds.length < 2) {
      return res
        .status(400)
        .json({ error: "Mega Buy order has invalid source orders" });
    }

    const { data: sourceOrders, error: fetchError } = await supabase
      .from("orders")
      .select("*")
      .in("id", childOrderIds);

    if (fetchError) throw fetchError;

    if (sourceOrders.length !== childOrderIds.length) {
      return res
        .status(400)
        .json({ error: "One or more source orders no longer exist" });
    }

    if (sourceOrders.some((item) => item.order_type === "mega_buy")) {
      return res
        .status(400)
        .json({ error: "Mega Buy order cannot have Mega Buy child orders" });
    }

    if (sourceOrders.some((item) => item.state !== "Locked")) {
      return res.status(400).json({
        error: "All child orders must be Locked to unlock Mega Buy order",
      });
    }

    const now = new Date().toISOString();

    // Unlock all child orders - return them to Draft state
    for (const childOrder of sourceOrders) {
      const { error: unlockError } = await supabase
        .from("orders")
        .update({
          state: "Draft",
          locked_by_mega_order_id: null,
          locked_at: null,
          updated_at: now,
        })
        .eq("id", childOrder.id);

      if (unlockError) throw unlockError;
    }

    // Unlock the mega order - return to Draft state
    const { error: megaUnlockError } = await supabase
      .from("orders")
      .update({
        state: "Draft",
        placed_at: null,
        updated_at: now,
      })
      .eq("id", req.params.id);

    if (megaUnlockError) throw megaUnlockError;

    res.json({
      message: "Mega Buy order unlocked successfully",
      mega_order_id: order.id,
      child_order_ids: childOrderIds,
      state: "Draft",
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to unlock order: " + error.message });
  }
});

// Close Mega Buy order
router.post("/:id/close", async (req, res) => {
  try {
    const order = await fetchOrderById(req.params.id);

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    if (order.order_type !== "mega_buy") {
      return res
        .status(400)
        .json({ error: "Only Mega Buy orders can be closed with this action" });
    }

    if (order.state !== "Delivered") {
      return res
        .status(400)
        .json({ error: "Only Delivered Mega Buy orders can be closed" });
    }

    const childOrderIds = getMegaChildOrderIds(order);

    if (childOrderIds.length < 2) {
      return res
        .status(400)
        .json({ error: "Mega Buy order has invalid source orders" });
    }

    const { data: sourceOrders, error: fetchError } = await supabase
      .from("orders")
      .select("*")
      .in("id", childOrderIds);

    if (fetchError) throw fetchError;

    if (sourceOrders.length !== childOrderIds.length) {
      return res
        .status(400)
        .json({ error: "One or more source orders no longer exist" });
    }

    if (sourceOrders.some((item) => item.order_type === "mega_buy")) {
      return res
        .status(400)
        .json({ error: "Mega Buy order cannot have Mega Buy child orders" });
    }

    if (sourceOrders.some((item) => item.state !== "Delivered")) {
      return res.status(400).json({
        error:
          "All child orders must be Delivered before closing Mega Buy order",
      });
    }

    const now = new Date().toISOString();

    for (const childOrder of sourceOrders) {
      const { error: closeError } = await supabase
        .from("orders")
        .update({
          state: "Closed",
          updated_at: now,
        })
        .eq("id", childOrder.id);

      if (closeError) throw closeError;
    }

    const { error: megaCloseError } = await supabase
      .from("orders")
      .update({
        state: "Closed",
        child_order_ids: childOrderIds,
        source_order_ids: childOrderIds,
        updated_at: now,
      })
      .eq("id", req.params.id);

    if (megaCloseError) throw megaCloseError;

    res.json({
      message: "Mega Buy order closed successfully",
      mega_order_id: order.id,
      child_order_ids: childOrderIds,
      state: "Closed",
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to close order: " + error.message });
  }
});

// Delete order
router.delete("/:id", async (req, res) => {
  try {
    const order = await fetchOrderById(req.params.id);

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    // Validate secret phrase if order has one
    if (order.secret_phrase) {
      const { secret_phrase } = req.body || {};
      if (!secret_phrase || secret_phrase !== order.secret_phrase) {
        return res.status(403).json({ error: "Incorrect secret phrase" });
      }
    }

    if (order.order_type === "mega_buy" && order.state === "Closed") {
      const childOrderIds = getMegaChildOrderIds(order);

      if (childOrderIds.length > 0) {
        const { data: sourceOrders, error: fetchError } = await supabase
          .from("orders")
          .select("*")
          .in("id", childOrderIds);

        if (fetchError) throw fetchError;

        if (sourceOrders.length !== childOrderIds.length) {
          return res
            .status(400)
            .json({ error: "One or more child orders no longer exist" });
        }

        if (sourceOrders.some((item) => item.order_type === "mega_buy")) {
          return res.status(400).json({
            error: "Mega Buy order cannot have Mega Buy child orders",
          });
        }

        if (sourceOrders.some((item) => item.state !== "Closed")) {
          return res.status(400).json({
            error:
              "All child orders must be Closed before deleting a Closed Mega Buy order",
          });
        }

        const { error: childDeleteError } = await supabase
          .from("orders")
          .delete()
          .in("id", childOrderIds);

        if (childDeleteError) throw childDeleteError;
      }

      const { error: megaDeleteError } = await supabase
        .from("orders")
        .delete()
        .eq("id", req.params.id);

      if (megaDeleteError) throw megaDeleteError;

      return res.json({
        message: "Closed Mega Buy order and child orders deleted successfully",
        mega_order_id: order.id,
        child_order_ids: childOrderIds,
      });
    }

    if (order.state !== "Draft") {
      return res.status(400).json({
        error:
          "Only Draft orders can be deleted, except Closed Mega Buy orders which delete with their child orders",
      });
    }

    // order_items deleted via ON DELETE CASCADE
    const { error } = await supabase
      .from("orders")
      .delete()
      .eq("id", req.params.id);

    if (error) throw error;
    res.json({ message: "Order deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete order: " + error.message });
  }
});

module.exports = router;
