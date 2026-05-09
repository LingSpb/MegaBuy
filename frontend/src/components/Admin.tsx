import { useState, useMemo, useCallback, useEffect } from "react";
import { useApp } from "../context/AppContext";
import { useI18n } from "../i18n";
import * as XLSX from "xlsx";

type AdminView = "overview" | "delivery";

// Delivery status: key is "orderId:productId", value is delivered or not
type DeliveryStatus = "none" | "delivered";

interface OrderQuantity {
  quantity: number;
  unit: string; // "carton" or unit label
  unitsCount: number; // quantity converted to individual units
}

interface ProductRow {
  product_id: string;
  product_name: string;
  package_quantity: number;
  unit_label: string;
  orderQuantities: { [orderId: string]: OrderQuantity };
  totalUnits: number; // total in individual units
}

interface QuantityEdit {
  orderId: string;
  productId: string;
  quantity: number;
  unit: string;
}

export default function Admin() {
  const { orders, products, categories, bulkUpdateOrderItems, showToast } =
    useApp();
  const { t } = useI18n();
  const [activeView, setActiveView] = useState<AdminView>("overview");
  const [editingCell, setEditingCell] = useState<{
    orderId: string;
    productId: string;
  } | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [editUnit, setEditUnit] = useState<string>("");
  const [pendingEdits, setPendingEdits] = useState<QuantityEdit[]>([]);
  const [deliveryStatus, setDeliveryStatus] = useState<
    Record<string, DeliveryStatus>
  >({});

  // Get the active Mega Buy order (Draft, Locked, or Delivered) and its child orders
  const { megaOrder, childOrders } = useMemo(() => {
    // Find the most recent Draft, Locked or Delivered Mega order
    const mega = orders
      .filter(
        (o) =>
          o.order_type === "mega_buy" &&
          (o.state === "Draft" ||
            o.state === "Locked" ||
            o.state === "Delivered"),
      )
      .sort(
        (a, b) =>
          new Date(b.updated_at || b.created_at || "").getTime() -
          new Date(a.updated_at || a.created_at || "").getTime(),
      )[0];

    if (!mega) return { megaOrder: null, childOrders: [] };

    // Get child orders - use child_order_ids or source_order_ids
    let childIds = mega.child_order_ids?.length
      ? mega.child_order_ids
      : mega.source_order_ids || [];

    let children = orders.filter((o) => childIds.includes(o.id));

    // For Draft mega orders, if no children found, show all Draft normal orders
    if (mega.state === "Draft" && children.length === 0) {
      children = orders.filter(
        (o) => o.order_type !== "mega_buy" && o.state === "Draft",
      );
    }

    return { megaOrder: mega, childOrders: children };
  }, [orders]);

  // Build the product matrix
  const productRows = useMemo(() => {
    if (childOrders.length === 0) return [];

    // Collect all unique products from child orders
    const productMap = new Map<string, ProductRow>();

    // Track which order/product combos we've processed
    const processedCells = new Set<string>();

    for (const order of childOrders) {
      for (const item of order.items) {
        const product = products.find((p) => p.id === item.product_id);
        const packageQty = product?.package_quantity || 1;
        const unitLabel = product?.unit_label || "unit";

        if (!productMap.has(item.product_id)) {
          productMap.set(item.product_id, {
            product_id: item.product_id,
            product_name: item.product_name || product?.name || item.product_id,
            package_quantity: packageQty,
            unit_label: unitLabel,
            orderQuantities: {},
            totalUnits: 0,
          });
        }

        const row = productMap.get(item.product_id)!;
        // Check if there's a pending edit for this cell
        const pendingEdit = pendingEdits.find(
          (e) => e.orderId === order.id && e.productId === item.product_id,
        );

        const quantity = pendingEdit ? pendingEdit.quantity : item.quantity;
        const unit = pendingEdit ? pendingEdit.unit : item.unit || unitLabel;

        // Convert to individual units for totaling
        const isCarton = unit.toLowerCase() === "carton";
        const unitsCount = isCarton ? quantity * packageQty : quantity;

        row.orderQuantities[order.id] = {
          quantity,
          unit,
          unitsCount,
        };

        processedCells.add(`${order.id}:${item.product_id}`);
      }
    }

    // Also process pending edits for NEW items (not yet in order.items)
    for (const edit of pendingEdits) {
      const cellKey = `${edit.orderId}:${edit.productId}`;
      if (processedCells.has(cellKey)) continue; // Already processed

      // This is a new item being added
      const product = products.find((p) => p.id === edit.productId);
      if (!product) continue;

      const packageQty = product.package_quantity || 1;
      const unitLabel = product.unit_label || "unit";

      if (!productMap.has(edit.productId)) {
        productMap.set(edit.productId, {
          product_id: edit.productId,
          product_name: product.name,
          package_quantity: packageQty,
          unit_label: unitLabel,
          orderQuantities: {},
          totalUnits: 0,
        });
      }

      const row = productMap.get(edit.productId)!;
      const isCarton = edit.unit.toLowerCase() === "carton";
      const unitsCount = isCarton ? edit.quantity * packageQty : edit.quantity;

      row.orderQuantities[edit.orderId] = {
        quantity: edit.quantity,
        unit: edit.unit,
        unitsCount,
      };
    }

    // Calculate totals in individual units
    for (const row of productMap.values()) {
      row.totalUnits = Object.values(row.orderQuantities).reduce(
        (sum, oq) => sum + oq.unitsCount,
        0,
      );
    }

    // Sort by product name
    return Array.from(productMap.values()).sort((a, b) =>
      a.product_name.localeCompare(b.product_name),
    );
  }, [childOrders, products, pendingEdits]);

  // Check if total is a round carton number
  const isRoundCarton = (
    totalUnits: number,
    packageQuantity: number,
  ): boolean => {
    if (packageQuantity <= 1) return true;
    return totalUnits % packageQuantity === 0;
  };

  // Calculate cartons and remainder
  const getCartonInfo = (
    totalUnits: number,
    packageQuantity: number,
  ): { cartons: number; remainder: number } => {
    if (packageQuantity <= 1) return { cartons: totalUnits, remainder: 0 };
    return {
      cartons: Math.floor(totalUnits / packageQuantity),
      remainder: totalUnits % packageQuantity,
    };
  };

  // Start editing a cell
  const startEditing = (
    orderId: string,
    productId: string,
    oq: OrderQuantity,
  ) => {
    setEditingCell({ orderId, productId });
    setEditValue(String(oq.quantity));
    setEditUnit(oq.unit);
  };

  // Cancel editing
  const cancelEditing = () => {
    setEditingCell(null);
    setEditValue("");
    setEditUnit("");
  };

  // Apply the edit to pending edits (not saved yet)
  const applyEdit = () => {
    if (!editingCell) return;

    const newQuantity = parseFloat(editValue);
    if (isNaN(newQuantity) || newQuantity < 0) {
      cancelEditing();
      return;
    }

    // Determine correct unit - for non-carton products, always use unit_label
    const row = productRows.find((r) => r.product_id === editingCell.productId);
    const requiresCarton = row && row.package_quantity > 1;
    const finalUnit = requiresCarton ? editUnit : row?.unit_label || editUnit;

    console.log("applyEdit:", {
      orderId: editingCell.orderId,
      productId: editingCell.productId,
      quantity: newQuantity,
      unit: finalUnit,
    });

    // Update or add to pending edits
    setPendingEdits((prev) => {
      console.log("Previous pendingEdits:", prev.length, "items");
      const existing = prev.findIndex(
        (e) =>
          e.orderId === editingCell.orderId &&
          e.productId === editingCell.productId,
      );
      const newEdit = {
        orderId: editingCell.orderId,
        productId: editingCell.productId,
        quantity: newQuantity,
        unit: finalUnit,
      };
      if (existing >= 0) {
        console.log("Updating existing edit at index", existing);
        const updated = [...prev];
        updated[existing] = newEdit;
        console.log("New pendingEdits will have", updated.length, "items");
        return updated;
      }
      console.log(
        "Adding new edit, new total will be",
        prev.length + 1,
        "items",
      );
      return [...prev, newEdit];
    });

    cancelEditing();
  };

  // Save all pending edits to the server
  const saveAllEdits = useCallback(async () => {
    // Filter out items with quantity 0 (treated as "no change" or cancelled additions)
    const validEdits = pendingEdits.filter((edit) => edit.quantity > 0);
    console.log("saveAllEdits called");
    console.log("All pendingEdits:", JSON.stringify(pendingEdits, null, 2));
    console.log("validEdits (qty > 0):", JSON.stringify(validEdits, null, 2));
    if (validEdits.length === 0) {
      console.log("No valid edits, clearing pendingEdits");
      setPendingEdits([]);
      return;
    }

    try {
      const result = await bulkUpdateOrderItems(validEdits);
      console.log("Bulk update result:", result);

      if (result.failCount === 0) {
        setPendingEdits([]);
        showToast(t("admin.changesSaved"), "success");
      } else if (result.successCount > 0) {
        // Some succeeded, some failed - keep failed ones as pending
        const failedEdits = validEdits.filter((edit) => {
          const res = result.results.find(
            (r) => r.orderId === edit.orderId && r.productId === edit.productId,
          );
          return res && !res.success;
        });
        setPendingEdits(failedEdits);
        showToast(
          `${result.successCount} saved, ${result.failCount} failed`,
          "error",
        );
      } else {
        // All failed
        showToast(t("admin.saveFailed"), "error");
      }
    } catch (error) {
      console.error("saveAllEdits error:", error);
      showToast(t("admin.saveFailed"), "error");
    }
  }, [pendingEdits, bulkUpdateOrderItems, showToast, t]);

  // Discard all pending edits
  const discardEdits = () => {
    setPendingEdits([]);
  };

  // Handle key press in edit input
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      applyEdit();
    } else if (e.key === "Escape") {
      cancelEditing();
    }
  };

  // Export to Excel for Madam Hong
  const exportToMadamHong = useCallback(() => {
    if (productRows.length === 0) {
      showToast(t("admin.noDataToExport"), "error");
      return;
    }

    // Build export data with Product Code, Product Name, Quantity
    const exportData = productRows.map((row) => {
      const requiresCarton = row.package_quantity > 1;

      let quantityStr: string;
      if (requiresCarton) {
        const cartons = Math.floor(row.totalUnits / row.package_quantity);
        const remainder = row.totalUnits % row.package_quantity;

        if (cartons > 0 && remainder > 0) {
          // e.g., "2 cartons + 5 units"
          quantityStr = `${cartons} ${t("admin.carton")}${cartons > 1 ? "s" : ""} + ${remainder} ${row.unit_label}`;
        } else if (cartons > 0) {
          // e.g., "2 cartons"
          quantityStr = `${cartons} ${t("admin.carton")}${cartons > 1 ? "s" : ""}`;
        } else {
          // Only units, no full cartons
          quantityStr = `${remainder} ${row.unit_label}`;
        }
      } else {
        // Non-carton product, just show units
        quantityStr = `${row.totalUnits} ${row.unit_label}`;
      }

      return {
        [t("admin.productCode")]: row.product_id,
        [t("admin.productName")]: row.product_name,
        [t("admin.quantity")]: quantityStr,
      };
    });

    // Create workbook and worksheet
    const ws = XLSX.utils.json_to_sheet(exportData);

    // Set column widths
    ws["!cols"] = [
      { wch: 15 }, // Product Code
      { wch: 40 }, // Product Name
      { wch: 25 }, // Quantity
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Order");

    // Generate filename with date
    const date = new Date().toISOString().split("T")[0];
    const filename = `MadamHong_Order_${date}.xlsx`;

    // Download the file
    XLSX.writeFile(wb, filename);

    showToast(t("admin.exportSuccess"), "success");
  }, [productRows, showToast, t]);

  // Export full Mega Buy Order with all people's quantities
  const exportMegaBuyOrder = useCallback(() => {
    if (productRows.length === 0 || childOrders.length === 0) {
      showToast(t("admin.noDataToExport"), "error");
      return;
    }

    // Build header row: Product Code, Product Name, [Person Names...], Total, Cartons
    const headers = [
      t("admin.productCode"),
      t("admin.productName"),
      ...childOrders.map((o) => o.person_name),
      t("admin.total"),
      t("admin.cartons"),
    ];

    // Build data rows
    const dataRows = productRows.map((row) => {
      const requiresCarton = row.package_quantity > 1;
      const cartons = requiresCarton
        ? Math.floor(row.totalUnits / row.package_quantity)
        : 0;
      const remainder = requiresCarton
        ? row.totalUnits % row.package_quantity
        : 0;

      // Format carton info
      let cartonStr: string;
      if (requiresCarton) {
        if (cartons > 0 && remainder > 0) {
          cartonStr = `${cartons} + ${remainder}`;
        } else if (cartons > 0) {
          cartonStr = String(cartons);
        } else {
          cartonStr = `0 + ${remainder}`;
        }
      } else {
        cartonStr = "-";
      }

      // Build row with quantities for each person
      const rowData: Record<string, string | number> = {
        [t("admin.productCode")]: row.product_id,
        [t("admin.productName")]: row.product_name,
      };

      // Add each person's quantity
      for (const order of childOrders) {
        const oq = row.orderQuantities[order.id];
        if (oq) {
          // Format: "2 ctn" or "5 units"
          const unitDisplay =
            oq.unit === "carton" && requiresCarton
              ? "ctn"
              : oq.unit === "carton"
                ? row.unit_label
                : oq.unit;
          rowData[order.person_name] = `${oq.quantity} ${unitDisplay}`;
        } else {
          rowData[order.person_name] = "";
        }
      }

      rowData[t("admin.total")] = `${row.totalUnits} ${row.unit_label}`;
      rowData[t("admin.cartons")] = cartonStr;

      return rowData;
    });

    // Create worksheet from data
    const ws = XLSX.utils.json_to_sheet(dataRows, { header: headers });

    // Set column widths
    const colWidths = [
      { wch: 12 }, // Product Code
      { wch: 35 }, // Product Name
      ...childOrders.map(() => ({ wch: 12 })), // Person columns
      { wch: 15 }, // Total
      { wch: 12 }, // Cartons
    ];
    ws["!cols"] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "MegaBuy Order");

    // Generate filename with date and mega order name
    const date = new Date().toISOString().split("T")[0];
    const filename = `MegaBuy_${megaOrder?.person_name || "Order"}_${date}.xlsx`;

    // Download the file
    XLSX.writeFile(wb, filename);

    showToast(t("admin.exportSuccess"), "success");
  }, [productRows, childOrders, megaOrder, showToast, t]);

  // Calculate total amount with VAT for each order
  const orderTotals = useMemo(() => {
    const totals: Record<string, number> = {};

    for (const order of childOrders) {
      let total = 0;
      for (const item of order.items) {
        const product = products.find((p) => p.id === item.product_id);
        if (!product) continue;

        const packageQty = product.package_quantity || 1;
        const unitPrice = Number(product.price);

        // Calculate item total based on unit
        const isCarton = item.unit?.toLowerCase() === "carton";
        const itemPrice = isCarton
          ? unitPrice * packageQty * item.quantity
          : unitPrice * item.quantity;

        // Get VAT rate for this product's category
        const category = categories.find((c) => c.id === product.category_id);
        const vatRate = category?.vat ?? 6;
        const priceWithVat = itemPrice * (1 + vatRate / 100);

        total += priceWithVat;
      }
      totals[order.id] = Math.round(total * 100) / 100;
    }
    return totals;
  }, [childOrders, products, categories]);

  // Load delivery status when megaOrder changes
  useEffect(() => {
    if (!megaOrder) {
      setDeliveryStatus({});
      return;
    }

    const loadDeliveryStatus = async () => {
      try {
        const res = await fetch(`/api/delivery-status/${megaOrder.id}`);
        if (!res.ok) throw new Error("Failed to load delivery status");
        const data = await res.json();
        setDeliveryStatus(data);
      } catch (error) {
        console.error("Error loading delivery status:", error);
      }
    };

    loadDeliveryStatus();
  }, [megaOrder?.id]);

  // Toggle delivery status for a cell
  const toggleDeliveryStatus = useCallback(
    async (orderId: string, productId: string) => {
      if (!megaOrder) return;

      const key = `${orderId}:${productId}`;
      const current = deliveryStatus[key] || "none";
      const next: DeliveryStatus = current === "none" ? "delivered" : "none";

      // Optimistic update
      setDeliveryStatus((prev) => ({ ...prev, [key]: next }));

      // Save to backend
      try {
        const res = await fetch("/api/delivery-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            megaOrderId: megaOrder.id,
            childOrderId: orderId,
            productId: productId,
            status: next,
          }),
        });

        if (!res.ok) {
          throw new Error("Failed to save delivery status");
        }
      } catch (error) {
        console.error("Error saving delivery status:", error);
        // Revert on error
        setDeliveryStatus((prev) => ({ ...prev, [key]: current }));
        showToast(t("admin.saveFailed"), "error");
      }
    },
    [megaOrder, deliveryStatus, showToast, t],
  );

  // Get delivery status class for a cell
  const getDeliveryClass = useCallback(
    (orderId: string, productId: string): string => {
      const key = `${orderId}:${productId}`;
      const status = deliveryStatus[key] || "none";
      if (status === "delivered") return "delivery-delivered";
      return "";
    },
    [deliveryStatus],
  );

  return (
    <section className="admin-section">
      <h2>{t("nav.admin")}</h2>

      <div className="admin-tabs">
        <button
          className={`btn ${activeView === "overview" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setActiveView("overview")}
        >
          {t("admin.overview")}
        </button>
        <button
          className={`btn ${activeView === "delivery" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setActiveView("delivery")}
        >
          {t("admin.deliveryStatus")}
        </button>
      </div>

      {activeView === "overview" && (
        <div className="admin-overview">
          {!megaOrder ? (
            <div className="empty-state">
              <p>{t("admin.noActiveMegaOrder")}</p>
            </div>
          ) : (
            <>
              <div className="admin-header">
                <h3>
                  {t("admin.megaOrderOverview")}: {megaOrder.person_name}
                </h3>
                <span
                  className={`state-badge ${megaOrder.state.toLowerCase()}`}
                >
                  {megaOrder.state}
                </span>
                <button
                  className="btn btn-primary export-btn"
                  onClick={exportToMadamHong}
                  disabled={productRows.length === 0}
                >
                  {t("admin.exportToMadamHong")}
                </button>
                <button
                  className="btn btn-secondary export-btn"
                  onClick={exportMegaBuyOrder}
                  disabled={productRows.length === 0}
                >
                  {t("admin.exportMegaBuyOrder")}
                </button>
              </div>

              {pendingEdits.length > 0 && (
                <div className="admin-actions">
                  <span className="pending-count">
                    {t("admin.pendingChanges").replace(
                      "{count}",
                      String(pendingEdits.length),
                    )}
                  </span>
                  <button className="btn btn-primary" onClick={saveAllEdits}>
                    {t("admin.saveChanges")}
                  </button>
                  <button className="btn btn-secondary" onClick={discardEdits}>
                    {t("admin.discardChanges")}
                  </button>
                </div>
              )}

              <div className="overview-table-container">
                <table className="overview-table">
                  <thead>
                    <tr>
                      <th className="sticky-col">{t("admin.product")}</th>
                      {childOrders.map((order) => (
                        <th key={order.id} className="order-col">
                          {order.person_name}
                        </th>
                      ))}
                      <th className="total-col">{t("admin.total")}</th>
                      <th className="carton-col">{t("admin.cartons")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productRows.map((row) => {
                      const requiresCarton = row.package_quantity > 1;
                      const cartonInfo = requiresCarton
                        ? getCartonInfo(row.totalUnits, row.package_quantity)
                        : { cartons: 0, remainder: 0 };
                      const isRound = requiresCarton
                        ? isRoundCarton(row.totalUnits, row.package_quantity)
                        : true;

                      return (
                        <tr key={row.product_id}>
                          <td className="sticky-col product-cell">
                            <strong>{row.product_id}</strong>
                            <br />
                            <span className="product-name">
                              {row.product_name}
                            </span>
                            {requiresCarton && (
                              <>
                                <br />
                                <span className="package-info">
                                  {row.package_quantity} {row.unit_label}/
                                  {t("admin.carton")}
                                </span>
                              </>
                            )}
                          </td>
                          {childOrders.map((order) => {
                            const oq = row.orderQuantities[order.id];
                            const isEditing =
                              editingCell?.orderId === order.id &&
                              editingCell?.productId === row.product_id;
                            const hasPendingEdit = pendingEdits.some(
                              (e) =>
                                e.orderId === order.id &&
                                e.productId === row.product_id,
                            );

                            return (
                              <td
                                key={order.id}
                                className={`qty-cell ${hasPendingEdit ? "pending" : ""}`}
                              >
                                {isEditing ? (
                                  <div className="qty-edit-group">
                                    <input
                                      type="number"
                                      className="qty-input"
                                      value={editValue}
                                      onChange={(e) =>
                                        setEditValue(e.target.value)
                                      }
                                      onKeyDown={handleKeyDown}
                                      autoFocus
                                      min="0"
                                      step="0.5"
                                    />
                                    {requiresCarton ? (
                                      <select
                                        className="qty-unit-select"
                                        value={editUnit}
                                        onChange={(e) =>
                                          setEditUnit(e.target.value)
                                        }
                                        onKeyDown={handleKeyDown}
                                      >
                                        <option value="carton">ctn</option>
                                        <option value={row.unit_label}>
                                          {row.unit_label}
                                        </option>
                                      </select>
                                    ) : (
                                      <span className="qty-unit-label">
                                        {row.unit_label}
                                      </span>
                                    )}
                                    <button
                                      className="qty-confirm-btn"
                                      onClick={applyEdit}
                                      title="Confirm"
                                    >
                                      ✓
                                    </button>
                                    <button
                                      className="qty-cancel-btn"
                                      onClick={cancelEditing}
                                      title="Cancel"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                ) : oq ? (
                                  <button
                                    className="qty-button"
                                    onClick={() =>
                                      startEditing(order.id, row.product_id, oq)
                                    }
                                    title={t("admin.clickToEdit")}
                                  >
                                    {oq.quantity}{" "}
                                    <span className="qty-unit">
                                      {oq.unit === "carton" && requiresCarton
                                        ? "ctn"
                                        : oq.unit === "carton"
                                          ? row.unit_label
                                          : oq.unit}
                                    </span>
                                  </button>
                                ) : (
                                  <button
                                    className="qty-button qty-add"
                                    onClick={() =>
                                      startEditing(order.id, row.product_id, {
                                        quantity: 0,
                                        unit: row.unit_label,
                                        unitsCount: 0,
                                      })
                                    }
                                    title={t("admin.clickToAdd")}
                                  >
                                    +
                                  </button>
                                )}
                              </td>
                            );
                          })}
                          <td
                            className={`total-cell ${!isRound ? "not-round" : ""}`}
                          >
                            {row.totalUnits} {row.unit_label}
                          </td>
                          <td
                            className={`carton-cell ${!isRound ? "not-round" : ""}`}
                          >
                            {requiresCarton ? (
                              <>
                                {cartonInfo.cartons}
                                {cartonInfo.remainder > 0 && (
                                  <span className="remainder">
                                    {" "}
                                    +{cartonInfo.remainder}
                                  </span>
                                )}
                              </>
                            ) : (
                              <span className="qty-empty">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {activeView === "delivery" && (
        <div className="admin-delivery">
          {!megaOrder ? (
            <div className="empty-state">
              <p>{t("admin.noActiveMegaOrder")}</p>
            </div>
          ) : (
            <>
              <div className="admin-header">
                <h3>
                  {t("admin.deliveryStatus")}: {megaOrder.person_name}
                </h3>
                <span
                  className={`state-badge ${megaOrder.state.toLowerCase()}`}
                >
                  {megaOrder.state}
                </span>
              </div>

              <div className="delivery-legend">
                <span className="legend-item">
                  <span className="legend-box"></span> {t("admin.notDelivered")}
                </span>
                <span className="legend-item">
                  <span className="legend-box delivery-delivered"></span>{" "}
                  {t("admin.delivered")}
                </span>
              </div>

              <div className="overview-table-container">
                <table className="overview-table delivery-table">
                  <thead>
                    <tr>
                      <th className="sticky-col">{t("admin.product")}</th>
                      {childOrders.map((order) => (
                        <th key={order.id} className="order-col">
                          <div>{order.person_name}</div>
                          <div className="order-total">
                            {orderTotals[order.id]?.toFixed(2) || 0} kr
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {productRows.map((row) => {
                      const requiresCarton = row.package_quantity > 1;

                      return (
                        <tr key={row.product_id}>
                          <td className="sticky-col product-cell">
                            <strong>{row.product_id}</strong>
                            <br />
                            <span className="product-name">
                              {row.product_name}
                            </span>
                          </td>
                          {childOrders.map((order) => {
                            const oq = row.orderQuantities[order.id];
                            const deliveryClass = getDeliveryClass(
                              order.id,
                              row.product_id,
                            );

                            return (
                              <td
                                key={order.id}
                                className={`qty-cell delivery-cell ${deliveryClass}`}
                                onClick={() =>
                                  oq &&
                                  toggleDeliveryStatus(order.id, row.product_id)
                                }
                                title={
                                  oq ? t("admin.clickToToggle") : undefined
                                }
                              >
                                {oq ? (
                                  <span className="delivery-qty">
                                    {oq.quantity}{" "}
                                    <span className="qty-unit">
                                      {oq.unit === "carton" && requiresCarton
                                        ? "ctn"
                                        : oq.unit === "carton"
                                          ? row.unit_label
                                          : oq.unit}
                                    </span>
                                  </span>
                                ) : (
                                  <span className="qty-empty">-</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
