/**
 * Category routes for MegaBuy
 */

const express = require("express");
const router = express.Router();
const supabase = require("../lib/supabase");
const { fetchCategories } = require("../utils/categories");

// Get all categories
router.get("/", async (req, res) => {
  try {
    const categories = await fetchCategories();
    res.json(categories);
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to load categories: " + error.message });
  }
});

// Get category by ID
router.get("/:id", async (req, res) => {
  try {
    const { data: category, error } = await supabase
      .from("categories")
      .select("*")
      .eq("id", req.params.id)
      .single();

    if (error || !category) {
      return res.status(404).json({ error: "Category not found" });
    }
    res.json(category);
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to load category: " + error.message });
  }
});

// Create new category
router.post("/", async (req, res) => {
  const { name, description, vat } = req.body;

  if (!name || name.trim() === "") {
    return res.status(400).json({ error: "Category name is required" });
  }

  try {
    // Check if category already exists
    const { data: existing } = await supabase
      .from("categories")
      .select("id")
      .ilike("name", name.trim())
      .limit(1);

    if (existing && existing.length > 0) {
      return res.status(400).json({ error: "Category already exists" });
    }

    const newCategory = {
      id: Date.now().toString(),
      name: name.trim(),
      description: description || "",
      vat: vat != null ? Number(vat) : 6,
      created_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("categories")
      .insert(newCategory)
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to create category: " + error.message });
  }
});

// Update category
router.put("/:id", async (req, res) => {
  const { name, description, vat } = req.body;

  if (!name || name.trim() === "") {
    return res.status(400).json({ error: "Category name is required" });
  }

  try {
    const { data: category, error: findError } = await supabase
      .from("categories")
      .select("*")
      .eq("id", req.params.id)
      .single();

    if (findError || !category) {
      return res.status(404).json({ error: "Category not found" });
    }

    // Check for name conflict
    const { data: conflicts } = await supabase
      .from("categories")
      .select("id")
      .ilike("name", name.trim())
      .neq("id", req.params.id)
      .limit(1);

    if (conflicts && conflicts.length > 0) {
      return res.status(400).json({ error: "Category name already exists" });
    }

    const { data, error } = await supabase
      .from("categories")
      .update({
        name: name.trim(),
        description: description || "",
        vat: vat != null ? Number(vat) : (category.vat ?? 6),
      })
      .eq("id", req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to update category: " + error.message });
  }
});

// Delete category
router.delete("/:id", async (req, res) => {
  try {
    const { data: category } = await supabase
      .from("categories")
      .select("id")
      .eq("id", req.params.id)
      .single();

    if (!category) {
      return res.status(404).json({ error: "Category not found" });
    }

    // Check if category has products (via product_metadata)
    const { data: products } = await supabase
      .from("product_metadata")
      .select("product_id")
      .eq("category_id", req.params.id)
      .limit(1);

    if (products && products.length > 0) {
      return res
        .status(400)
        .json({ error: "Cannot delete category with products" });
    }

    const { error } = await supabase
      .from("categories")
      .delete()
      .eq("id", req.params.id);

    if (error) throw error;
    res.json({ message: "Category deleted successfully" });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to delete category: " + error.message });
  }
});

module.exports = router;
