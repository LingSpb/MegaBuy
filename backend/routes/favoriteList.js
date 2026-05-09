/**
 * Favorite List routes for MegaBuy
 */

const express = require("express");
const router = express.Router();
const supabase = require("../lib/supabase");

// Get all favorite list items (with product details)
router.get("/", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("shopping_list")
      .select("*, products(*)")
      .order("created_at", { ascending: false });

    if (error) throw error;

    // Transform to include product info
    const items = data.map((item) => ({
      id: item.id,
      product_id: item.product_id,
      added_by: item.added_by,
      note: item.note,
      created_at: item.created_at,
      product: item.products,
    }));

    res.json(items);
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to load shopping list: " + error.message });
  }
});

// Add product to favorite list
router.post("/", async (req, res) => {
  const { product_id, added_by, note } = req.body;

  if (!product_id) {
    return res.status(400).json({ error: "Product ID is required" });
  }

  try {
    // Check if product exists
    const { data: product, error: productError } = await supabase
      .from("products")
      .select("id")
      .eq("id", product_id)
      .single();

    if (productError || !product) {
      return res.status(404).json({ error: "Product not found" });
    }

    // Check if already in list
    const { data: existing } = await supabase
      .from("shopping_list")
      .select("id")
      .eq("product_id", product_id)
      .single();

    if (existing) {
      return res
        .status(400)
        .json({ error: "Product already in shopping list" });
    }

    const { data, error } = await supabase
      .from("shopping_list")
      .insert({
        product_id,
        added_by: added_by || null,
        note: note || null,
      })
      .select("*, products(*)")
      .single();

    if (error) throw error;

    res.status(201).json({
      id: data.id,
      product_id: data.product_id,
      added_by: data.added_by,
      note: data.note,
      created_at: data.created_at,
      product: data.products,
    });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to add to shopping list: " + error.message });
  }
});

// Remove product from favorite list
router.delete("/:productId", async (req, res) => {
  try {
    const { error } = await supabase
      .from("shopping_list")
      .delete()
      .eq("product_id", req.params.productId);

    if (error) throw error;
    res.json({ message: "Removed from shopping list" });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to remove from shopping list: " + error.message });
  }
});

// Clear entire favorite list
router.delete("/", async (req, res) => {
  try {
    const { error } = await supabase
      .from("shopping_list")
      .delete()
      .neq("id", 0); // Delete all rows

    if (error) throw error;
    res.json({ message: "Shopping list cleared" });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to clear shopping list: " + error.message });
  }
});

module.exports = router;
