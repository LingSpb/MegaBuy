/**
 * Pricing utility functions for MegaBuy
 */

function normalizeUnit(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function buildProductUnits(product) {
  const units = new Set();
  const unitLabel = normalizeUnit(product.unit_label);
  const packageUnit = normalizeUnit(product.package_unit);

  if (product.selling_type === "package") {
    // Package type: show carton and small unit
    units.add("carton");
    if (unitLabel) {
      units.add(unitLabel);
    }
    if (packageUnit) {
      units.add(packageUnit);
      if (packageUnit.endsWith("s") && packageUnit.length > 1) {
        units.add(packageUnit.slice(0, -1));
      }
    }
  } else {
    // Unit type: show only the small unit, no carton
    if (unitLabel) {
      units.add(unitLabel);
    } else {
      units.add("unit");
    }
  }

  return Array.from(units);
}

function getProductUnitPrice(product, unit) {
  const normalizedUnit = normalizeUnit(unit);
  const normalizedUnitLabel = normalizeUnit(product.unit_label);
  const normalizedPackageUnit = normalizeUnit(product.package_unit);
  const singularPackageUnit = normalizedPackageUnit.endsWith("s")
    ? normalizedPackageUnit.slice(0, -1)
    : normalizedPackageUnit;

  // product.price is the unit price (price per single unit)
  const unitPrice = Number(product.price);
  const packageQuantity = Number(product.package_quantity) || 1;

  if (normalizedUnit === "carton") {
    // Carton price = unit price × package quantity
    return Number((unitPrice * packageQuantity).toFixed(2));
  }

  if (
    normalizedUnit === normalizedUnitLabel ||
    normalizedUnit === normalizedPackageUnit ||
    normalizedUnit === singularPackageUnit
  ) {
    // Return unit price directly
    return unitPrice;
  }

  return null;
}

function toSingularUnit(value) {
  const normalized = normalizeUnit(value);
  if (!normalized) return "";
  if (normalized.endsWith("s") && normalized.length > 1) {
    return normalized.slice(0, -1);
  }
  return normalized;
}

function getSmallUnitForProduct(product) {
  const unitLabel = toSingularUnit(product.unit_label);
  if (unitLabel && unitLabel !== "carton") {
    return unitLabel;
  }

  const packageUnit = toSingularUnit(product.package_unit);
  if (packageUnit && packageUnit !== "carton") {
    return packageUnit;
  }

  return "unit";
}

/**
 * Get available units for a product based on package_quantity
 * - If package_quantity > 1: ["unit", "carton"]
 * - Otherwise: ["unit"]
 */
function getAvailableUnits(product) {
  const packageQty = Number(product.package_quantity) || 1;
  if (packageQty > 1) {
    return ["unit", "carton"];
  }
  return ["unit"];
}

function hydrateOrderPricing(order, products) {
  if (!order || !Array.isArray(order.items)) {
    return {
      ...order,
      items: [],
      total_amount: Number((Number(order?.total_amount) || 0).toFixed(2)),
    };
  }

  let totalAmount = 0;
  const hydratedItems = order.items.map((item) => {
    const product = products.find((p) => p.id === item.product_id);
    const quantity = Number(item.quantity) || 0;
    const unit = normalizeUnit(item.unit);

    if (!product) {
      const existingLineTotal =
        item.line_total == null ? null : Number(item.line_total);
      if (existingLineTotal !== null && Number.isFinite(existingLineTotal)) {
        totalAmount += existingLineTotal;
      }

      return {
        ...item,
        quantity,
        unit,
        line_total: existingLineTotal,
      };
    }

    const unitPrice = getProductUnitPrice(product, unit);
    const lineTotal =
      unitPrice !== null ? Number((unitPrice * quantity).toFixed(2)) : null;

    if (lineTotal !== null) {
      totalAmount += lineTotal;
    }

    return {
      ...item,
      product_name: item.product_name || product.name,
      quantity,
      unit,
      unit_price: unitPrice,
      line_total: lineTotal,
    };
  });

  return {
    ...order,
    items: hydratedItems,
    total_amount: Number(totalAmount.toFixed(2)),
  };
}

/**
 * Aggregate items from multiple orders into a MegaBuy order.
 * For package products: includes full cartons AND remainder (no automatic cuts).
 * Each item includes contributor info sorted by priority (oldest orders first).
 * Contributors who ordered full cartons are marked as "protected".
 *
 * @param {Array} products - All products
 * @param {Array} sourceOrders - Orders to aggregate (must have created_at field)
 * @returns {Object} { items, total_amount }
 *   - items: aggregated MegaBuy items with contributors info
 *   - total_amount: total price
 */
function aggregateMegaBuyItems(products, sourceOrders) {
  // Track items per product with order info for priority calculation
  const perProduct = new Map();

  sourceOrders.forEach((order) => {
    order.items.forEach((item) => {
      const key = item.product_id;
      if (!perProduct.has(key)) {
        perProduct.set(key, []);
      }
      perProduct.get(key).push({
        ...item,
        order_id: order.id,
        person_name: order.person_name,
        // Use item's created_at if available, fall back to order's created_at
        item_created_at: item.created_at || order.created_at,
      });
    });
  });

  const mergedItems = [];
  let totalAmount = 0;

  for (const [productId, sourceItems] of perProduct.entries()) {
    const product = products.find((p) => p.id === productId);
    if (!product) {
      throw new Error(`Product '${productId}' was not found while aggregating`);
    }

    if (product.selling_type === "package") {
      const cartonSize = Number(product.package_quantity) || 1;
      const smallUnit = getSmallUnitForProduct(product);
      const packageUnit = toSingularUnit(product.package_unit);

      // Track contributions per order (in small units)
      const contributions = sourceItems.map((item) => {
        const itemUnit = toSingularUnit(item.unit);
        const quantity = Number(item.quantity) || 0;
        let smallUnits = 0;
        let orderedFullCartons = false;

        if (itemUnit === "carton") {
          smallUnits = quantity * cartonSize;
          orderedFullCartons = true; // Person ordered full cartons - protected from cuts
        } else if (
          itemUnit === smallUnit ||
          (packageUnit && itemUnit === packageUnit)
        ) {
          smallUnits = quantity;
        }

        return {
          order_id: item.order_id,
          person_name: item.person_name,
          item_created_at: item.item_created_at,
          original_quantity: quantity,
          original_unit: item.unit,
          small_units: Number(smallUnits.toFixed(2)),
          ordered_full_cartons: orderedFullCartons,
        };
      });

      // Sort contributions by created_at ascending (oldest first = highest priority)
      const sortedContributions = [...contributions].sort((a, b) => {
        const dateA = new Date(a.item_created_at || 0);
        const dateB = new Date(b.item_created_at || 0);
        return dateA - dateB; // Oldest first
      });

      const totalSmallUnits = Number(
        contributions.reduce((sum, c) => sum + c.small_units, 0).toFixed(2),
      );
      const cartonCount = Math.floor(totalSmallUnits / cartonSize);
      const remainder = Number((totalSmallUnits % cartonSize).toFixed(2));

      // Build contributors array for display (sorted by priority)
      const contributors = sortedContributions.map((c) => ({
        order_id: c.order_id,
        person_name: c.person_name,
        quantity: c.original_quantity,
        unit: c.original_unit,
        small_units: c.small_units,
        ordered_at: c.item_created_at,
        protected: c.ordered_full_cartons, // Protected if ordered full cartons
      }));

      // Add carton line (full cartons)
      if (cartonCount > 0) {
        const unitPrice = getProductUnitPrice(product, "carton");
        const lineTotal =
          unitPrice !== null
            ? Number((unitPrice * cartonCount).toFixed(2))
            : null;
        if (lineTotal !== null) {
          totalAmount += lineTotal;
        }
        mergedItems.push({
          product_id: product.id,
          product_name: product.name,
          quantity: cartonCount,
          unit: "carton",
          unit_price: unitPrice,
          line_total: lineTotal,
          contributors,
          has_remainder: remainder > 0,
          remainder_quantity: remainder,
          remainder_unit: smallUnit,
          carton_size: cartonSize,
        });
      }

      // Add remainder line (units that don't complete a carton)
      if (remainder > 0) {
        const unitPrice = getProductUnitPrice(product, smallUnit);
        const lineTotal =
          unitPrice !== null
            ? Number((unitPrice * remainder).toFixed(2))
            : null;
        if (lineTotal !== null) {
          totalAmount += lineTotal;
        }

        // For remainder, show contributors in reverse priority (newest first = cut candidates)
        const remainderContributors = [...contributors].reverse();

        mergedItems.push({
          product_id: product.id,
          product_name: product.name,
          quantity: remainder,
          unit: smallUnit,
          unit_price: unitPrice,
          line_total: lineTotal,
          contributors: remainderContributors,
          is_remainder: true,
          carton_size: cartonSize,
        });
      }

      continue;
    }

    // For unit products (non-package), aggregate as before
    const perUnit = new Map();
    const contributorsByUnit = new Map();

    sourceItems.forEach((item) => {
      const unitKey = toSingularUnit(item.unit) || "unit";
      const quantity = Number(item.quantity) || 0;
      perUnit.set(
        unitKey,
        Number(((perUnit.get(unitKey) || 0) + quantity).toFixed(2)),
      );

      // Track contributors per unit
      if (!contributorsByUnit.has(unitKey)) {
        contributorsByUnit.set(unitKey, []);
      }
      contributorsByUnit.get(unitKey).push({
        order_id: item.order_id,
        person_name: item.person_name,
        quantity: quantity,
        unit: item.unit,
        small_units: quantity,
        ordered_at: item.item_created_at,
        protected: false,
      });
    });

    for (const [unitKey, quantity] of perUnit.entries()) {
      const unitPrice = getProductUnitPrice(product, unitKey);
      const lineTotal =
        unitPrice !== null ? Number((unitPrice * quantity).toFixed(2)) : null;
      if (lineTotal !== null) {
        totalAmount += lineTotal;
      }

      // Sort contributors by ordered_at (oldest first)
      const contributors = (contributorsByUnit.get(unitKey) || []).sort(
        (a, b) => {
          const dateA = new Date(a.ordered_at || 0);
          const dateB = new Date(b.ordered_at || 0);
          return dateA - dateB;
        },
      );

      mergedItems.push({
        product_id: product.id,
        product_name: product.name,
        quantity,
        unit: unitKey,
        unit_price: unitPrice,
        line_total: lineTotal,
        contributors,
      });
    }
  }

  return {
    items: mergedItems,
    total_amount: Number(totalAmount.toFixed(2)),
  };
}

function getMegaChildOrderIds(order) {
  if (
    Array.isArray(order.child_order_ids) &&
    order.child_order_ids.length > 0
  ) {
    return order.child_order_ids;
  }

  if (
    Array.isArray(order.source_order_ids) &&
    order.source_order_ids.length > 0
  ) {
    return order.source_order_ids;
  }

  return [];
}

module.exports = {
  normalizeUnit,
  buildProductUnits,
  getProductUnitPrice,
  toSingularUnit,
  getSmallUnitForProduct,
  getAvailableUnits,
  hydrateOrderPricing,
  aggregateMegaBuyItems,
  getMegaChildOrderIds,
};
