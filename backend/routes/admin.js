/**
 * Admin routes for MegaBuy
 */

const express = require("express");
const router = express.Router();
const supabase = require("../lib/supabase");
const { fetchProducts } = require("../lib/products");
const { fetchOrderById } = require("../lib/orders");
const { getProductUnitPrice } = require("../utils/pricing");

// Bulk update order items (for Admin Overview)
router.post("/bulk-update-items", async (req, res) => {
  try {
    const { edits } = req.body;
    // edits: [{ orderId, productId, quantity, unit }, ...]

    console.log("Bulk update items:", edits?.length, "edits");

    if (!Array.isArray(edits) || edits.length === 0) {
      return res.status(400).json({ error: "No edits provided" });
    }

    const results = [];
    const products = await fetchProducts();

    for (const edit of edits) {
      const { orderId, productId, quantity, unit } = edit;

      try {
        if (quantity == null || quantity < 0) {
          results.push({
            orderId,
            productId,
            success: false,
            error: "Invalid quantity",
          });
          continue;
        }

        const order = await fetchOrderById(orderId);
        if (!order) {
          results.push({
            orderId,
            productId,
            success: false,
            error: "Order not found",
          });
          continue;
        }

        if (order.state === "Closed") {
          results.push({
            orderId,
            productId,
            success: false,
            error: "Cannot edit Closed orders",
          });
          continue;
        }

        // Check if item exists
        const { data: existingItem } = await supabase
          .from("order_items")
          .select("*")
          .eq("order_id", orderId)
          .eq("product_id", productId)
          .single();

        // Get product info for price calculation
        const product = products.find((p) => p.id === productId);
        if (!product) {
          results.push({
            orderId,
            productId,
            success: false,
            error: "Product not found",
          });
          continue;
        }

        if (existingItem) {
          // Update existing item
          const itemUnit = unit || existingItem.unit;
          const unitPrice = getProductUnitPrice(product, itemUnit);
          const lineTotal =
            unitPrice !== null
              ? Number((unitPrice * quantity).toFixed(2))
              : null;

          const updateData = {
            quantity: quantity,
            unit_price: unitPrice,
            line_total: lineTotal,
          };
          if (unit) {
            updateData.unit = unit;
          }

          const { error: updateError } = await supabase
            .from("order_items")
            .update(updateData)
            .eq("order_id", orderId)
            .eq("product_id", productId);

          if (updateError) {
            results.push({
              orderId,
              productId,
              success: false,
              error: updateError.message,
            });
            continue;
          }
        } else {
          // Add new item
          const { data: maxOrderItems } = await supabase
            .from("order_items")
            .select("sort_order")
            .eq("order_id", orderId)
            .order("sort_order", { ascending: false })
            .limit(1);

          const nextSortOrder =
            maxOrderItems?.length > 0
              ? (maxOrderItems[0].sort_order || 0) + 1
              : 0;

          const itemUnit = unit || product.unit_label || "unit";
          const unitPrice = getProductUnitPrice(product, itemUnit);
          const lineTotal =
            unitPrice !== null
              ? Number((unitPrice * quantity).toFixed(2))
              : null;

          const newItem = {
            order_id: orderId,
            product_id: productId,
            product_name: product.name,
            quantity: quantity,
            unit: itemUnit,
            unit_price: unitPrice,
            line_total: lineTotal,
            sort_order: nextSortOrder,
          };

          const { error: insertError } = await supabase
            .from("order_items")
            .insert(newItem);

          if (insertError) {
            results.push({
              orderId,
              productId,
              success: false,
              error: insertError.message,
            });
            continue;
          }
        }

        // Recalculate order total
        const { data: items, error: itemsError } = await supabase
          .from("order_items")
          .select("*")
          .eq("order_id", orderId);

        if (!itemsError && items) {
          let totalAmount = 0;
          for (const item of items) {
            if (item.line_total != null) {
              totalAmount += Number(item.line_total);
            } else if (item.unit_price != null) {
              totalAmount += Number(item.unit_price) * Number(item.quantity);
            }
          }

          await supabase
            .from("orders")
            .update({
              total_amount: totalAmount,
              updated_at: new Date().toISOString(),
            })
            .eq("id", orderId);
        }

        results.push({ orderId, productId, success: true });
      } catch (err) {
        results.push({
          orderId,
          productId,
          success: false,
          error: err.message,
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;

    console.log(
      `Bulk update complete: ${successCount} success, ${failCount} failed`,
    );

    res.json({
      message: `${successCount} items updated, ${failCount} failed`,
      results,
      successCount,
      failCount,
    });
  } catch (error) {
    console.error("Bulk update error:", error);
    res.status(500).json({ error: "Bulk update failed: " + error.message });
  }
});

// Update a single order item quantity (for Admin adjustments)
router.patch("/orders/:orderId/items/:productId", async (req, res) => {
  try {
    const { orderId, productId } = req.params;
    const { quantity, unit } = req.body;

    console.log("PATCH order item:", { orderId, productId, quantity, unit });

    if (quantity == null || quantity < 0) {
      return res.status(400).json({ error: "Invalid quantity" });
    }

    const order = await fetchOrderById(orderId);
    if (!order) {
      console.log("Order not found:", orderId);
      return res.status(404).json({ error: "Order not found" });
    }

    console.log("Order state:", order.state, "type:", order.order_type);

    // Only allow editing non-Closed orders from Admin
    if (order.state === "Closed") {
      return res.status(400).json({ error: "Cannot edit Closed orders" });
    }

    // Check if item exists
    const { data: existingItem } = await supabase
      .from("order_items")
      .select("*")
      .eq("order_id", orderId)
      .eq("product_id", productId)
      .single();

    // Get product info for price calculation
    const { data: product } = await supabase
      .from("products")
      .select("name, price, package_quantity, unit_label, package_unit")
      .eq("id", productId)
      .single();

    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    if (existingItem) {
      // Update existing item
      const itemUnit = unit || existingItem.unit;
      const unitPrice = getProductUnitPrice(product, itemUnit);
      const lineTotal =
        unitPrice !== null ? Number((unitPrice * quantity).toFixed(2)) : null;

      const updateData = {
        quantity: quantity,
        unit_price: unitPrice,
        line_total: lineTotal,
      };
      if (unit) {
        updateData.unit = unit;
      }

      const { error: updateError } = await supabase
        .from("order_items")
        .update(updateData)
        .eq("order_id", orderId)
        .eq("product_id", productId);

      if (updateError) throw updateError;
    } else {
      // Add new item - get max sort_order for this order
      const { data: maxOrderItems } = await supabase
        .from("order_items")
        .select("sort_order")
        .eq("order_id", orderId)
        .order("sort_order", { ascending: false })
        .limit(1);

      const nextSortOrder =
        maxOrderItems?.length > 0 ? (maxOrderItems[0].sort_order || 0) + 1 : 0;

      const itemUnit = unit || product.unit_label || "unit";
      const unitPrice = getProductUnitPrice(product, itemUnit);
      const lineTotal =
        unitPrice !== null ? Number((unitPrice * quantity).toFixed(2)) : null;

      const newItem = {
        order_id: orderId,
        product_id: productId,
        product_name: product.name,
        quantity: quantity,
        unit: itemUnit,
        unit_price: unitPrice,
        line_total: lineTotal,
        sort_order: nextSortOrder,
      };

      const { error: insertError } = await supabase
        .from("order_items")
        .insert(newItem);

      if (insertError) throw insertError;
    }

    // Recalculate order total
    const { data: items, error: itemsError } = await supabase
      .from("order_items")
      .select("*")
      .eq("order_id", orderId);

    if (itemsError) throw itemsError;

    let totalAmount = 0;
    for (const item of items) {
      if (item.line_total != null) {
        totalAmount += Number(item.line_total);
      } else if (item.unit_price != null) {
        totalAmount += Number(item.unit_price) * Number(item.quantity);
      }
    }

    const { error: orderUpdateError } = await supabase
      .from("orders")
      .update({
        total_amount: totalAmount,
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId);

    if (orderUpdateError) throw orderUpdateError;

    res.json({
      message: existingItem ? "Order item updated" : "Order item added",
      orderId,
      productId,
      quantity,
    });
  } catch (error) {
    console.error(
      "PATCH /api/admin/orders/:orderId/items/:productId error:",
      error,
    );
    res
      .status(500)
      .json({ error: "Failed to update order item: " + error.message });
  }
});

module.exports = router;
