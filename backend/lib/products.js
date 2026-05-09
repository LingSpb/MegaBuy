/**
 * Product data access layer for MegaBuy
 */

const supabase = require("./supabase");

async function fetchProducts() {
  // Supabase has a server-side limit of 1000 rows, so we need to paginate
  const PAGE_SIZE = 1000;
  let allData = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from("products")
      .select(
        `
        *,
        product_metadata (
          category_id,
          description,
          selling_type,
          unit_label,
          unit_price,
          package_unit,
          created_at
        )
      `,
      )
      .order("name", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;

    allData = allData.concat(data);
    hasMore = data.length === PAGE_SIZE;
    from += PAGE_SIZE;
  }

  console.log(`Fetched ${allData.length} products (paginated)`);

  // Flatten the joined data
  return allData.map((p) => ({
    id: p.id,
    name: p.name,
    brand: p.brand,
    price: p.price,
    package_quantity: p.package_quantity,
    // Metadata fields (may be null if no metadata exists)
    category_id: p.product_metadata?.category_id,
    description: p.product_metadata?.description || "",
    selling_type: p.product_metadata?.selling_type || "package",
    unit_label: p.product_metadata?.unit_label || "unit",
    unit_price: p.product_metadata?.unit_price,
    package_unit: p.product_metadata?.package_unit || "units",
    created_at: p.product_metadata?.created_at,
  }));
}

module.exports = {
  fetchProducts,
};
