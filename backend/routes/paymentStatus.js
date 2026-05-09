/**
 * Payment Status routes for MegaBuy
 */

const express = require("express");
const router = express.Router();
const supabase = require("../lib/supabase");

// Get payment status for a mega order
router.get("/:megaOrderId", async (req, res) => {
  const { megaOrderId } = req.params;

  try {
    const { data, error } = await supabase
      .from("payment_status")
      .select("*")
      .eq("mega_order_id", megaOrderId);

    if (error) throw error;

    // Transform to key-value format: { "orderId": true/false }
    const statusMap = {};
    for (const row of data || []) {
      statusMap[row.child_order_id] = row.paid;
    }

    res.json(statusMap);
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to load payment status: " + error.message });
  }
});

// Update payment status for a specific child order
router.post("/", async (req, res) => {
  const { megaOrderId, childOrderId, paid } = req.body;

  if (!megaOrderId || !childOrderId || typeof paid !== "boolean") {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    // Upsert the payment status
    const { data, error } = await supabase
      .from("payment_status")
      .upsert(
        {
          mega_order_id: megaOrderId,
          child_order_id: childOrderId,
          paid: paid,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "mega_order_id,child_order_id" },
      )
      .select()
      .single();

    if (error) throw error;

    res.json(data);
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to update payment status: " + error.message });
  }
});

module.exports = router;
