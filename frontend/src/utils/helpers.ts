import type {
  ProductWithMetadata,
  Order,
  OrderItem,
  OrderItemFormData,
} from "../types";

export function normalizeUnit(value: string | undefined | null): string {
  return String(value || "")
    .trim()
    .toLowerCase();
}

export function toSingularUnit(value: string | undefined | null): string {
  const normalized = normalizeUnit(value);
  if (!normalized) return "";
  if (normalized.endsWith("s") && normalized.length > 1) {
    return normalized.slice(0, -1);
  }
  return normalized;
}

export function getProductUnits(product: ProductWithMetadata): string[] {
  const units = new Set<string>();
  const unitLabel = normalizeUnit(product.unit_label);
  const packageUnit = normalizeUnit(product.package_unit);

  if (product.selling_type === "package") {
    units.add("carton");
    if (unitLabel) units.add(unitLabel);
    if (packageUnit && packageUnit !== "units" && packageUnit !== "unit") {
      const isSingularForm =
        packageUnit.endsWith("s") && packageUnit.slice(0, -1) === unitLabel;
      if (packageUnit !== unitLabel && !isSingularForm) {
        units.add(packageUnit);
      }
    }
  } else {
    units.add(unitLabel || "unit");
  }

  return Array.from(units);
}

export function getUnitPrice(
  product: ProductWithMetadata,
  unit: string,
): number | null {
  const normalizedUnit = normalizeUnit(unit);
  const unitLabel = normalizeUnit(product.unit_label);
  const packageUnit = normalizeUnit(product.package_unit);
  const singularPackageUnit = packageUnit.endsWith("s")
    ? packageUnit.slice(0, -1)
    : packageUnit;

  // product.price is the unit price (price per single unit)
  const unitPrice = Number(product.price);
  const packageQuantity = Number(product.package_quantity) || 1;

  if (normalizedUnit === "carton") {
    // Carton price = unit price × package quantity
    return Number((unitPrice * packageQuantity).toFixed(2));
  }

  if (
    normalizedUnit === unitLabel ||
    normalizedUnit === packageUnit ||
    normalizedUnit === singularPackageUnit
  ) {
    // Return unit price directly
    return unitPrice;
  }

  if (normalizedUnit === "unit" && product.selling_type === "unit") {
    return unitPrice;
  }

  return null;
}

export function getSmallUnitForProduct(product: ProductWithMetadata): string {
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

export function getProductDescription(product: ProductWithMetadata): string {
  if (product.description && product.description.trim()) {
    return product.description;
  }

  if (product.selling_type === "package") {
    const unitLabel = product.unit_label || "unit";
    const packageQuantity = product.package_quantity || 1;
    const pkgUnit = product.package_unit;
    const packageUnit =
      unitLabel ||
      (pkgUnit && pkgUnit !== "units" && pkgUnit !== "unit"
        ? pkgUnit
        : "units");

    // product.price is the unit price
    const unitPrice = product.price;
    const cartonPrice = Number((unitPrice * packageQuantity).toFixed(2));

    if (unitPrice) {
      return `${unitPrice} kr/${unitLabel}. Carton: ${cartonPrice} kr (${packageQuantity} ${packageUnit})`;
    } else {
      return `Sold by carton (${packageQuantity} ${packageUnit} per carton)`;
    }
  }

  return "No description";
}

export function formatOrderDate(dateString: string | undefined | null): string {
  if (!dateString) return "N/A";
  const date = new Date(dateString);
  const datePart = date.toISOString().split("T")[0];
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${datePart} ${hours}:${minutes}`;
}

export function getOrderStateClass(state: string | undefined | null): string {
  const normalized = String(state || "").toLowerCase();
  if (normalized === "draft") return "state-draft";
  if (normalized === "locked") return "state-locked";
  if (normalized === "delivered") return "state-delivered";
  return "state-closed";
}

export function formatOrderItemsSummary(items: OrderItem[]): string {
  if (!Array.isArray(items) || items.length === 0) {
    return "";
  }

  const grouped = new Map<
    string,
    { productName: string; units: Map<string, number> }
  >();

  items.forEach((item) => {
    const productKey =
      item.product_id || item.product_name || "unknown-product";
    const productName = item.product_id
      ? `${item.product_id} - ${item.product_name || "Unknown product"}`
      : item.product_name || "Unknown product";
    const unit = String(item.unit || "unit");
    const quantity = Number(item.quantity) || 0;

    if (!grouped.has(productKey)) {
      grouped.set(productKey, { productName, units: new Map() });
    }

    const productGroup = grouped.get(productKey)!;
    productGroup.units.set(
      unit,
      Number(((productGroup.units.get(unit) || 0) + quantity).toFixed(2)),
    );
  });

  return Array.from(grouped.values())
    .map((group) => {
      const unitSummary = Array.from(group.units.entries())
        .map(([unit, quantity]) => `${quantity} ${unit}`)
        .join(", ");
      return `${group.productName} (${unitSummary})`;
    })
    .join(" • ");
}

export function aggregateOrderItems(
  items: OrderItemFormData[],
): OrderItemFormData[] {
  const aggregated = new Map<string, OrderItemFormData>();

  items.forEach((item) => {
    const key = `${item.product_id}|${item.unit}`;
    const existing = aggregated.get(key);
    if (existing) {
      existing.quantity = Number(existing.quantity) + Number(item.quantity);
    } else {
      aggregated.set(key, { ...item, quantity: Number(item.quantity) });
    }
  });

  return Array.from(aggregated.values());
}

export function calculateOrderTotalWithVat(
  order: Order | null | undefined,
  products: ProductWithMetadata[],
  getCategoryVat: (categoryId: string) => number,
  calculatePriceWithVat: (price: number, vat: number) => number,
): number {
  if (!order || !Array.isArray(order.items)) return 0;

  let totalWithVat = 0;
  order.items.forEach((item) => {
    const product = products.find((p) => p.id === item.product_id);
    const vat = product ? getCategoryVat(product.category_id) : 6;
    const lineTotal = Number(item.line_total) || 0;
    totalWithVat += calculatePriceWithVat(lineTotal, vat);
  });

  return Number(totalWithVat.toFixed(2));
}
