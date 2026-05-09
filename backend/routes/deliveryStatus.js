/**
 * Delivery Status routes for MegaBuy
 */

const express = require("express");
const router = express.Router();
const supabase = require("../lib/supabase");

// Get delivery status for a mega order
router.get("/:megaOrderId", async (req, res) => {
  const { megaOrderId } = req.params;

  try {
    const { data, error } = await supabase
      .from("delivery_status")
      .select("*")
      .eq("mega_order_id", megaOrderId);

    if (error) throw error;

    // Transform to key-value format: { "orderId:productId": "delivered" }
    const statusMap = {};
    for (const row of data || []) {
      const key = `${row.child_order_id}:${row.product_id}`;
      statusMap[key] = row.status;
    }

    res.json(statusMap);
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to load delivery status: " + error.message });
  }
});

// Update delivery status for a specific item
router.post("/", async (req, res) => {
  const { megaOrderId, childOrderId, productId, status } = req.body;

  if (!megaOrderId || !childOrderId || !productId || !status) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  if (!["none", "delivered"].includes(status)) {
    return res.status(400).json({ error: "Invalid status value" });
  }

  try {
    // Upsert the delivery status
    const { data, error } = await supabase
      .from("delivery_status")
      .upsert(
        {
          mega_order_id: megaOrderId,
          child_order_id: childOrderId,
          product_id: productId,
          status: status,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "mega_order_id,child_order_id,product_id" },
      )
      .select()
      .single();

    if (error) throw error;

    res.json(data);
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to update delivery status: " + error.message });
  }
});

module.exports = router;
