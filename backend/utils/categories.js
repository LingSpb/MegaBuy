/**
 * Category utility functions for MegaBuy
 *
 * CATEGORY SYSTEM
 * ================
 * Categories are auto-derived from product codes.
 * The first letter of a product code determines its category.
 *
 * Examples:
 *   T04327 -> Category "T" (Thai/Sauces)
 *   D01699 -> Category "D" (Frozen/Meats)
 *   J04048 -> Category "J" (Japanese)
 *
 * Categories are auto-created if they don't exist.
 * See: docs/API_REFERENCE.md for full documentation.
 */

const supabase = require("../lib/supabase");

// Category name mapping based on product code prefix
const CATEGORY_NAMES = {
  C: "Chinese",
  D: "Frozen (Đông lạnh)",
  F: "Fruits & Desserts",
  H: "H",
  I: "I",
  J: "Japanese",
  K: "Korean",
  L: "Lee Kum Kee",
  M: "Monika",
  N: "Dairy & Non-Food",
  P: "Philippines",
  T: "Thai",
  U: "UK/European",
  V: "Vietnamese",
};

// Extract category ID from product code (first letter A-Z)
function extractCategoryFromProductCode(productCode) {
  if (!productCode || productCode.length === 0) return null;
  const firstChar = String(productCode).charAt(0).toUpperCase();
  if (/^[A-Z]$/.test(firstChar)) {
    return firstChar;
  }
  return null;
}

// Get category name from ID (uses mapping or falls back to ID)
function getCategoryName(categoryId) {
  return CATEGORY_NAMES[categoryId] || categoryId;
}

// Ensure category exists, create if not (auto-creates with proper name)
async function ensureCategoryExists(categoryId) {
  if (!categoryId) return false;

  const { data: existing } = await supabase
    .from("categories")
    .select("id")
    .eq("id", categoryId)
    .single();

  if (!existing) {
    const { error } = await supabase.from("categories").insert({
      id: categoryId,
      name: getCategoryName(categoryId),
      description: "",
      created_at: new Date().toISOString(),
    });
    if (error && !error.message.includes("duplicate")) {
      console.error(`Failed to create category ${categoryId}:`, error);
      return false;
    }
  }
  return true;
}

async function fetchCategories() {
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .order("name", { ascending: true })
    .range(0, 999);
  if (error) throw error;
  return data;
}

module.exports = {
  CATEGORY_NAMES,
  extractCategoryFromProductCode,
  getCategoryName,
  ensureCategoryExists,
  fetchCategories,
};
