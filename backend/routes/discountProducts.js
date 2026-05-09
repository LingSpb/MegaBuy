/**
 * Discount Products routes for MegaBuy
 */

const express = require("express");
const router = express.Router();
const supabase = require("../lib/supabase");

// Get all discount products
router.get("/", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("discount_products")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    // Fetch product details with metadata
    const productIds = (data || []).map((d) => d.product_id);
    let productsMap = {};

    if (productIds.length > 0) {
      const { data: productsData } = await supabase
        .from("products")
        .select(
          `
          id, name, price, package_quantity,
          product_metadata (
            unit_label
          )
        `,
        )
        .in("id", productIds);

      if (productsData) {
        productsMap = Object.fromEntries(
          productsData.map((p) => [
            p.id,
            {
              name: p.name,
              price: p.price,
              package_quantity: p.package_quantity,
              unit_label: p.product_metadata?.unit_label || "unit",
            },
          ]),
        );
      }
    }

    // Transform to include product info
    const items = (data || []).map((item) => {
      const product = productsMap[item.product_id];
      return {
        id: item.id,
        product_id: item.product_id,
        product_name: product?.name || item.product_id,
        original_price: product?.price || 0,
        discount_price: item.discount_price,
        package_quantity: product?.package_quantity || 1,
        unit_label: product?.unit_label || "unit",
        note: item.note,
        created_at: item.created_at,
      };
    });

    res.json(items);
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to load discount products: " + error.message });
  }
});

// Add discount product
router.post("/", async (req, res) => {
  const { product_id, discount_price, note } = req.body;

  if (!product_id || discount_price === undefined) {
    return res
      .status(400)
      .json({ error: "Product ID and discount price are required" });
  }

  try {
    // Check if product exists
    const { data: product, error: productError } = await supabase
      .from("products")
      .select("id, name")
      .eq("id", product_id)
      .single();

    if (productError || !product) {
      return res.status(404).json({ error: "Product not found" });
    }

    // Upsert the discount
    const { data, error } = await supabase
      .from("discount_products")
      .upsert(
        {
          product_id,
          discount_price: Number(discount_price),
          note: note || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "product_id" },
      )
      .select()
      .single();

    if (error) throw error;

    res.json(data);
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to add discount product: " + error.message });
  }
});

// Delete discount product
router.delete("/:productId", async (req, res) => {
  const { productId } = req.params;

  try {
    const { error } = await supabase
      .from("discount_products")
      .delete()
      .eq("product_id", productId);

    if (error) throw error;
    res.json({ message: "Discount removed" });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to remove discount: " + error.message });
  }
});

// Clear all discount products
router.delete("/", async (req, res) => {
  try {
    const { error } = await supabase
      .from("discount_products")
      .delete()
      .neq("id", 0); // Delete all rows

    if (error) throw error;
    res.json({ message: "All discounts cleared" });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to clear discounts: " + error.message });
  }
});

module.exports = router;
