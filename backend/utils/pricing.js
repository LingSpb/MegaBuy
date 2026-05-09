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

function aggregateMegaBuyItems(products, sourceOrders) {
  const perProduct = new Map();

  sourceOrders.forEach((order) => {
    order.items.forEach((item) => {
      const key = item.product_id;
      if (!perProduct.has(key)) {
        perProduct.set(key, []);
      }
      perProduct.get(key).push(item);
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

      let totalSmallUnits = 0;

      sourceItems.forEach((item) => {
        const itemUnit = toSingularUnit(item.unit);
        const quantity = Number(item.quantity) || 0;

        if (itemUnit === "carton") {
          totalSmallUnits += quantity * cartonSize;
          return;
        }

        if (
          itemUnit === smallUnit ||
          (packageUnit && itemUnit === packageUnit)
        ) {
          totalSmallUnits += quantity;
        }
      });

      // Round totalSmallUnits to 2 decimal places to avoid floating-point precision issues
      totalSmallUnits = Number(totalSmallUnits.toFixed(2));
      const cartonCount = Math.floor(totalSmallUnits / cartonSize);
      // Round remainder to 2 decimal places to avoid floating-point precision issues
      const remainder = Number((totalSmallUnits % cartonSize).toFixed(2));

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
        });
      }

      if (remainder > 0) {
        const unitPrice = getProductUnitPrice(product, smallUnit);
        const lineTotal =
          unitPrice !== null
            ? Number((unitPrice * remainder).toFixed(2))
            : null;
        if (lineTotal !== null) {
          totalAmount += lineTotal;
        }
        mergedItems.push({
          product_id: product.id,
          product_name: product.name,
          quantity: remainder,
          unit: smallUnit,
          unit_price: unitPrice,
          line_total: lineTotal,
        });
      }

      continue;
    }

    const perUnit = new Map();

    sourceItems.forEach((item) => {
      const unitKey = toSingularUnit(item.unit) || "unit";
      const quantity = Number(item.quantity) || 0;
      // Round to 2 decimal places to avoid floating-point precision issues
      perUnit.set(
        unitKey,
        Number(((perUnit.get(unitKey) || 0) + quantity).toFixed(2)),
      );
    });

    for (const [unitKey, quantity] of perUnit.entries()) {
      const unitPrice = getProductUnitPrice(product, unitKey);
      const lineTotal =
        unitPrice !== null ? Number((unitPrice * quantity).toFixed(2)) : null;
      if (lineTotal !== null) {
        totalAmount += lineTotal;
      }

      mergedItems.push({
        product_id: product.id,
        product_name: product.name,
        quantity,
        unit: unitKey,
        unit_price: unitPrice,
        line_total: lineTotal,
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
