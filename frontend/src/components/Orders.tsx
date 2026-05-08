import { useState, useMemo, FormEvent } from "react";
import { useApp } from "../context/AppContext";
import Modal from "./Modal";
import {
  getProductUnits,
  getUnitPrice,
  formatOrderDate,
  getOrderStateClass,
  formatOrderItemsSummary,
  aggregateOrderItems,
  calculateOrderTotalWithVat,
} from "../utils/helpers";
import type {
  Order,
  OrderItem,
  OrderItemFormData,
  ProductDetailsData,
} from "../types";

interface OrderFormState {
  person_name: string;
  order_date: string;
  secret_phrase: string;
  items: OrderItemFormData[];
}

export default function Orders() {
  const {
    products,
    orders,
    saveOrder,
    deleteOrder,
    createMegaBuyOrder,
    recalculateMegaBuyOrder,
    placeMegaBuyOrder,
    deliverMegaBuyOrder,
    closeMegaBuyOrder,
    showToast,
    getCategoryVat,
    calculatePriceWithVat,
  } = useApp();

  const [searchTerm, setSearchTerm] = useState("");
  const [showArchivedMega, setShowArchivedMega] = useState(false);
  const [showArchivedNormal, setShowArchivedNormal] = useState(false);
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [placeOrderModalOpen, setPlaceOrderModalOpen] = useState(false);
  const [pendingPlaceOrderId, setPendingPlaceOrderId] = useState<string | null>(
    null,
  );
  const [productDetailsModalOpen, setProductDetailsModalOpen] = useState(false);
  const [productDetailsData, setProductDetailsData] =
    useState<ProductDetailsData | null>(null);
  const [orderForm, setOrderForm] = useState<OrderFormState>({
    person_name: "",
    order_date: new Date().toISOString().split("T")[0],
    secret_phrase: "",
    items: [{ product_id: "", quantity: 1, unit: "carton" }],
  });
  const [orderModalError, setOrderModalError] = useState<string | null>(null);

  // Filter and sort orders
  const {
    activeMegaOrders,
    activeNormalOrders,
    archivedMegaOrders,
    archivedNormalOrders,
  } = useMemo(() => {
    const matchesSearch = (order: Order): boolean => {
      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      return (
        order.id.toLowerCase().includes(term) ||
        order.person_name.toLowerCase().includes(term) ||
        order.state.toLowerCase().includes(term)
      );
    };

    const activeMega = orders
      .filter(
        (o) =>
          o.order_type === "mega_buy" &&
          o.state !== "Closed" &&
          matchesSearch(o),
      )
      .sort(
        (a, b) =>
          new Date(b.updated_at || b.created_at || "").getTime() -
          new Date(a.updated_at || a.created_at || "").getTime(),
      );

    const activeNormal = orders
      .filter(
        (o) =>
          o.order_type !== "mega_buy" &&
          o.state !== "Closed" &&
          matchesSearch(o),
      )
      .sort(
        (a, b) => (Number(b.total_amount) || 0) - (Number(a.total_amount) || 0),
      );

    const archivedMega = orders
      .filter(
        (o) =>
          o.order_type === "mega_buy" &&
          o.state === "Closed" &&
          matchesSearch(o),
      )
      .sort(
        (a, b) =>
          new Date(b.updated_at || b.created_at || "").getTime() -
          new Date(a.updated_at || a.created_at || "").getTime(),
      );

    const archivedNormal = orders
      .filter(
        (o) =>
          o.order_type !== "mega_buy" &&
          o.state === "Closed" &&
          matchesSearch(o),
      )
      .sort(
        (a, b) =>
          new Date(b.updated_at || b.created_at || "").getTime() -
          new Date(a.updated_at || a.created_at || "").getTime(),
      );

    return {
      activeMegaOrders: activeMega,
      activeNormalOrders: activeNormal,
      archivedMegaOrders: archivedMega,
      archivedNormalOrders: archivedNormal,
    };
  }, [orders, searchTerm]);

  // Order modal functions
  const openOrderModal = (order: Order | null = null) => {
    if (order) {
      setEditingOrderId(order.id);
      setOrderForm({
        person_name: order.person_name,
        order_date: order.order_date,
        secret_phrase: "", // Secret phrase is not editable after creation
        items: order.items.map((item) => ({
          product_id: item.product_id,
          quantity: item.quantity,
          unit: item.unit,
        })),
      });
    } else {
      setEditingOrderId(null);
      setOrderForm({
        person_name: "",
        order_date: new Date().toISOString().split("T")[0],
        secret_phrase: "",
        items: [{ product_id: "", quantity: 1, unit: "carton" }],
      });
    }
    setOrderModalError(null);
    setOrderModalOpen(true);
  };

  const closeOrderModal = () => {
    setOrderModalOpen(false);
    setEditingOrderId(null);
    setOrderModalError(null);
  };

  const addOrderItem = () => {
    setOrderForm({
      ...orderForm,
      items: [
        { product_id: "", quantity: 1, unit: "carton" },
        ...orderForm.items,
      ],
    });
  };

  const removeOrderItem = (index: number) => {
    if (orderForm.items.length <= 1) {
      showToast("An order needs at least one item", "error");
      return;
    }
    setOrderForm({
      ...orderForm,
      items: orderForm.items.filter((_, i) => i !== index),
    });
  };

  const updateOrderItem = (
    index: number,
    field: keyof OrderItemFormData,
    value: string | number,
  ) => {
    const newItems = [...orderForm.items];
    newItems[index] = { ...newItems[index], [field]: value };

    // Update unit options when product changes
    if (field === "product_id") {
      const product = products.find((p) => p.id === value);
      if (product) {
        const units = getProductUnits(product);
        newItems[index].unit = units[0] || "carton";
      }
    }

    setOrderForm({ ...orderForm, items: newItems });
  };

  const calculateOrderTotal = () => {
    let total = 0;
    orderForm.items.forEach((item) => {
      const product = products.find((p) => p.id === item.product_id);
      const qty = Number(item.quantity);
      if (!product || !item.quantity || qty <= 0) return;

      const unitPrice = getUnitPrice(product, item.unit);
      if (unitPrice !== null) {
        total += Number((unitPrice * qty).toFixed(2));
      }
    });
    return total.toFixed(2);
  };

  const handleOrderSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!orderForm.person_name.trim()) {
      setOrderModalError("Person name is required");
      return;
    }

    // Check for duplicate person name (only for new orders or if name changed)
    const trimmedName = orderForm.person_name.trim().toLowerCase();
    const existingOrder = orders.find(
      (o) =>
        o.person_name.toLowerCase() === trimmedName &&
        o.id !== editingOrderId &&
        o.order_type !== "mega_buy",
    );
    if (existingOrder) {
      setOrderModalError(
        `An order for "${orderForm.person_name.trim()}" already exists`,
      );
      return;
    }

    const items = orderForm.items.map((item) => ({
      product_id: item.product_id,
      quantity: Number(item.quantity),
      unit: item.unit,
    }));

    if (
      items.some(
        (item) =>
          !item.product_id ||
          !item.unit ||
          !item.quantity ||
          item.quantity <= 0,
      )
    ) {
      setOrderModalError(
        "Each order item must have product, quantity and unit",
      );
      return;
    }

    const aggregatedItems = aggregateOrderItems(items);

    try {
      await saveOrder(
        {
          person_name: orderForm.person_name.trim(),
          order_date: orderForm.order_date,
          secret_phrase: orderForm.secret_phrase || undefined,
          items: aggregatedItems,
        },
        editingOrderId,
      );

      showToast(
        editingOrderId
          ? "Order updated successfully!"
          : "Order created successfully!",
      );
      closeOrderModal();
    } catch (error) {
      setOrderModalError((error as Error).message);
    }
  };

  const handleDeleteOrder = async (orderId: string) => {
    const order = orders.find((o) => o.id === orderId);
    if (!order) return;

    let secretPhrase: string | undefined;

    // Check if order has a secret phrase
    if (order.has_secret_phrase) {
      let promptMessage = `Enter the secret phrase to delete ${order.person_name}'s order:`;

      // Keep prompting until correct or cancelled
      while (true) {
        const enteredPhrase = prompt(promptMessage);
        if (enteredPhrase === null) return; // User cancelled
        secretPhrase = enteredPhrase;

        try {
          await deleteOrder(orderId, secretPhrase);
          showToast("Order deleted successfully!");
          return;
        } catch (error) {
          const errorMessage = (error as Error).message;
          if (errorMessage.includes("Incorrect secret phrase")) {
            promptMessage = `Incorrect phrase. Try again to delete ${order.person_name}'s order:`;
            continue;
          }
          showToast("Error: " + errorMessage, "error");
          return;
        }
      }
    } else {
      const confirmMsg =
        order.order_type === "mega_buy" && order.state === "Closed"
          ? "Delete this Closed Mega Buy order? This will also delete all its child orders."
          : "Are you sure you want to delete this draft order?";

      if (!confirm(confirmMsg)) return;

      try {
        await deleteOrder(orderId, secretPhrase);
        showToast("Order deleted successfully!");
      } catch (error) {
        showToast("Error: " + (error as Error).message, "error");
      }
    }
  };

  const handleEditOrder = (orderId: string) => {
    const order = orders.find((o) => o.id === orderId);
    if (!order) return;

    if (order.order_type === "mega_buy") {
      showToast(
        "Mega Buy order items are auto-generated and cannot be edited manually",
        "error",
      );
      return;
    }

    const isEditableDeliveredChild =
      order.state === "Delivered" && Boolean(order.locked_by_mega_order_id);
    if (order.state !== "Draft" && !isEditableDeliveredChild) {
      showToast(
        "Only Draft orders and Delivered child orders from a Mega Buy can be edited",
        "error",
      );
      return;
    }

    openOrderModal(order);
  };

  // Mega Buy functions
  const handleAddMegaBuyOrder = async () => {
    const sourceOrders = orders.filter(
      (o) => o.state === "Draft" && o.order_type !== "mega_buy",
    );

    if (sourceOrders.length < 2) {
      showToast(
        "Need at least 2 Draft normal orders to create Mega Buy order",
        "error",
      );
      return;
    }

    try {
      await createMegaBuyOrder(
        "Mega Buy Order",
        new Date().toISOString().split("T")[0],
        sourceOrders.map((o) => o.id),
      );
      showToast(
        `Mega Buy order created from ${sourceOrders.length} Draft normal orders`,
      );
    } catch (error) {
      showToast("Error: " + (error as Error).message, "error");
    }
  };

  const handleRecalculateMegaBuy = async (orderId: string) => {
    try {
      await recalculateMegaBuyOrder(orderId);
      showToast("Mega Buy order recalculated successfully!");
    } catch (error) {
      showToast("Error: " + (error as Error).message, "error");
    }
  };

  const openPlaceOrderModal = (orderId: string) => {
    const order = orders.find((o) => o.id === orderId);
    if (!order) return;
    setPendingPlaceOrderId(orderId);
    setPlaceOrderModalOpen(true);
  };

  const closePlaceOrderModal = () => {
    setPlaceOrderModalOpen(false);
    setPendingPlaceOrderId(null);
  };

  const handleConfirmPlaceOrder = async () => {
    if (!pendingPlaceOrderId) return;

    try {
      await placeMegaBuyOrder(pendingPlaceOrderId);
      showToast("Mega Buy order placed and all child orders locked!");
      closePlaceOrderModal();
    } catch (error) {
      showToast("Error: " + (error as Error).message, "error");
    }
  };

  const handleDeliverMegaBuy = async (orderId: string) => {
    if (
      !confirm(
        "Deliver this Mega Buy order? This will mark the Mega order and all child orders as Delivered.",
      )
    ) {
      return;
    }

    try {
      await deliverMegaBuyOrder(orderId);
      showToast("Mega Buy order delivered and child orders are now Delivered!");
    } catch (error) {
      showToast("Error: " + (error as Error).message, "error");
    }
  };

  const handleCloseMegaBuy = async (orderId: string) => {
    if (
      !confirm(
        "Close this Delivered Mega Buy order? This will move all child orders to Closed and archive.",
      )
    ) {
      return;
    }

    try {
      await closeMegaBuyOrder(orderId);
      showToast("Mega Buy order closed and child orders moved to archive!");
    } catch (error) {
      showToast("Error: " + (error as Error).message, "error");
    }
  };

  const pendingOrder = useMemo(() => {
    return orders.find((o) => o.id === pendingPlaceOrderId);
  }, [orders, pendingPlaceOrderId]);

  const formatOrderDetailsForCopy = (items: OrderItem[]): string => {
    if (!Array.isArray(items) || items.length === 0) return "No products";

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
          .map(([unit, quantity]: [string, number]) => `${quantity} ${unit}`)
          .join(", ");
        return `${group.productName} (${unitSummary})`;
      })
      .join(" • ");
  };

  const copyOrderDetails = () => {
    if (!pendingOrder) return;
    const details = formatOrderDetailsForCopy(pendingOrder.items);
    navigator.clipboard
      .writeText(details)
      .then(() => {
        showToast("Order details copied to clipboard!");
      })
      .catch(() => {
        showToast("Failed to copy to clipboard", "error");
      });
  };

  // Product details modal for Mega orders
  const showProductDetails = (megaOrderId: string, productId: string) => {
    const megaOrder = orders.find((o) => o.id === megaOrderId);
    const product = products.find((p) => p.id === productId);

    if (!megaOrder || !product) {
      showToast("Could not find order or product details", "error");
      return;
    }

    const childOrderIds =
      Array.isArray(megaOrder.child_order_ids) &&
      megaOrder.child_order_ids.length > 0
        ? megaOrder.child_order_ids
        : Array.isArray(megaOrder.source_order_ids)
          ? megaOrder.source_order_ids
          : [];

    const childOrders = orders.filter((o) => childOrderIds.includes(o.id));

    const pkgUnit = product.package_unit;
    const packageUnit =
      product.unit_label ||
      (pkgUnit && pkgUnit !== "units" && pkgUnit !== "unit" ? pkgUnit : "unit");
    const packageQuantity = product.package_quantity || 1;
    const isPackageProduct = product.selling_type === "package";
    const productInfoText = isPackageProduct
      ? `${product.id} - ${product.name}: carton × ${packageQuantity} ${packageUnit}`
      : `${product.id} - ${product.name}`;

    const breakdown: Array<{
      personName: string;
      orderId: string;
      itemsSummary: string;
    }> = [];
    const totalByUnit = new Map<string, number>();

    childOrders.forEach((order) => {
      const orderItems = order.items.filter(
        (item) => item.product_id === productId,
      );
      if (orderItems.length > 0) {
        const itemsSummary = orderItems
          .map((item) => {
            const qty = Number(item.quantity) || 0;
            const unit = (item.unit || "unit").toLowerCase();
            totalByUnit.set(
              unit,
              Number(((totalByUnit.get(unit) || 0) + qty).toFixed(2)),
            );
            return `${qty} ${unit}`;
          })
          .join(", ");
        breakdown.push({
          personName: order.person_name,
          orderId: order.id,
          itemsSummary,
        });
      }
    });

    const totalSum = Array.from(totalByUnit.entries())
      .map(([unit, qty]: [string, number]) => `${qty} ${unit}`)
      .join(", ");

    // product.price is the unit price; calculate carton price
    const unitPrice = product.price;
    const cartonPrice = Number((product.price * packageQuantity).toFixed(2));

    setProductDetailsData({
      productInfoText,
      totalSum,
      breakdown,
      productId,
      productPrice: cartonPrice,
      unitPrice,
      packageQuantity,
    });
    setProductDetailsModalOpen(true);
  };

  const closeProductDetailsModal = () => {
    setProductDetailsModalOpen(false);
    setProductDetailsData(null);
  };

  // Render mega order products grid
  const renderMegaProductsGrid = (items: OrderItem[], megaOrderId: string) => {
    if (!Array.isArray(items) || items.length === 0) {
      return <div className="mega-products-empty">No products</div>;
    }

    interface ProductGroup {
      productName: string;
      productId: string;
      sellingType: string;
      packageQuantity: number;
      packageUnit: string;
      units: Map<string, number>;
    }

    const grouped = new Map<string, ProductGroup>();
    items.forEach((item) => {
      const productKey =
        item.product_id || item.product_name || "unknown-product";
      const productName = item.product_id
        ? `${item.product_id} - ${item.product_name || "Unknown product"}`
        : item.product_name || "Unknown product";
      const unit = String(item.unit || "unit").toLowerCase();
      const quantity = Number(item.quantity) || 0;
      const product = products.find((p) => p.id === item.product_id);

      if (!grouped.has(productKey)) {
        const pkgUnit = product?.package_unit;
        const unitLabel = product?.unit_label;
        const displayUnit =
          unitLabel ||
          (pkgUnit && pkgUnit !== "units" && pkgUnit !== "unit"
            ? pkgUnit
            : "unit");

        grouped.set(productKey, {
          productName,
          productId: item.product_id,
          sellingType: product?.selling_type || "unit",
          packageQuantity: Number(product?.package_quantity) || 1,
          packageUnit: displayUnit,
          units: new Map(),
        });
      }

      const productGroup = grouped.get(productKey)!;
      productGroup.units.set(
        unit,
        Number(((productGroup.units.get(unit) || 0) + quantity).toFixed(2)),
      );
    });

    return Array.from(grouped.values()).map((group, index) => {
      const unitSummary = Array.from(group.units.entries())
        .map(([unit, quantity]: [string, number]) => `${quantity} ${unit}`)
        .join(", ");

      let isBelowPackage = false;
      if (group.sellingType === "package") {
        for (const [unit, quantity] of group.units.entries()) {
          if (unit !== "carton" && quantity < group.packageQuantity) {
            isBelowPackage = true;
            break;
          }
        }
      }

      return (
        <div
          key={index}
          className={`mega-product-item mega-product-item-clickable${isBelowPackage ? " mega-product-item-warning" : ""}`}
          onClick={() => showProductDetails(megaOrderId, group.productId)}
        >
          {group.productName}
          <span className="mega-product-qty">{unitSummary}</span>
        </div>
      );
    });
  };

  // Render order card
  const renderOrderCard = (order: Order) => {
    const childOrderIds =
      Array.isArray(order.child_order_ids) && order.child_order_ids.length > 0
        ? order.child_order_ids
        : Array.isArray(order.source_order_ids)
          ? order.source_order_ids
          : [];
    const canEditNormalOrder =
      order.order_type !== "mega_buy" &&
      (order.state === "Draft" ||
        (order.state === "Delivered" &&
          Boolean(order.locked_by_mega_order_id)));

    const isMegaBuy = order.order_type === "mega_buy";
    const totalAmount = Number(order.total_amount || 0);
    const totalWithVat = calculateOrderTotalWithVat(
      order,
      products,
      getCategoryVat,
      calculatePriceWithVat,
    );

    return (
      <div
        key={order.id}
        id={`order-${order.id}`}
        className={`card order-card ${isMegaBuy ? "mega-order-card" : ""}`}
      >
        <div className="card-content">
          <div className="order-header">
            <h3>{isMegaBuy ? order.id : order.person_name}</h3>
            <span className={`state-badge ${getOrderStateClass(order.state)}`}>
              {order.state}
            </span>
            {isMegaBuy && <span className="selling-type-badge">Mega Buy</span>}
          </div>
          {isMegaBuy && (
            <p>
              <strong>Person:</strong> {order.person_name}
            </p>
          )}
          <p>
            <strong>Updated:</strong>{" "}
            {formatOrderDate(order.updated_at || order.order_date)}
          </p>
          <p>
            <strong>Items:</strong> {order.items.length}
          </p>
          <p>
            <strong>Total:</strong> {totalAmount.toFixed(2)} kr{" "}
            <span className="total-vat-text">
              ({totalWithVat.toFixed(2)} kr incl. VAT)
            </span>
          </p>
          {isMegaBuy ? (
            <>
              {order.delivered_at && (
                <p>
                  <strong>Delivered:</strong>{" "}
                  {formatOrderDate(order.delivered_at)}
                </p>
              )}
              <div className="mega-order-section">
                <strong>Child Orders:</strong>
                <div className="mega-child-orders">
                  {childOrderIds.length > 0
                    ? childOrderIds.map((id) => {
                        const childOrder = orders.find((o) => o.id === id);
                        return (
                          <span
                            key={id}
                            className="child-order-tag child-order-link"
                            onClick={() => {
                              const element = document.getElementById(
                                `order-${id}`,
                              );
                              if (element) {
                                element.scrollIntoView({
                                  behavior: "smooth",
                                  block: "center",
                                });
                                element.classList.add("highlight-order");
                                setTimeout(
                                  () =>
                                    element.classList.remove("highlight-order"),
                                  2000,
                                );
                              }
                            }}
                            style={{ cursor: "pointer" }}
                            title={`Click to view ${childOrder?.person_name || id}'s order`}
                          >
                            {childOrder?.person_name || id}
                          </span>
                        );
                      })
                    : "N/A"}
                </div>
              </div>
              <div className="mega-order-section">
                <strong>Products:</strong>
                <div className="mega-products-grid">
                  {renderMegaProductsGrid(order.items, order.id)}
                </div>
              </div>
            </>
          ) : (
            <small>{formatOrderItemsSummary(order.items)}</small>
          )}
        </div>
        <div className="card-actions order-actions">
          {canEditNormalOrder && (
            <button
              className="btn btn-edit"
              onClick={() => handleEditOrder(order.id)}
            >
              Edit
            </button>
          )}
          {(order.state === "Draft" ||
            (isMegaBuy && order.state === "Closed")) && (
            <button
              className="btn btn-danger"
              onClick={() => handleDeleteOrder(order.id)}
            >
              Delete
            </button>
          )}
          {(order.state === "Draft" || order.state === "Delivered") &&
            isMegaBuy && (
              <button
                className="btn btn-dark"
                onClick={() => handleRecalculateMegaBuy(order.id)}
              >
                Recalculate
              </button>
            )}
          {order.state === "Draft" && isMegaBuy && (
            <button
              className="btn btn-primary"
              onClick={() => openPlaceOrderModal(order.id)}
            >
              Place Order
            </button>
          )}
          {order.state === "Locked" && isMegaBuy && (
            <button
              className="btn btn-primary"
              onClick={() => handleDeliverMegaBuy(order.id)}
            >
              Deliver Order
            </button>
          )}
          {order.state === "Delivered" && isMegaBuy && (
            <button
              className="btn btn-primary"
              onClick={() => handleCloseMegaBuy(order.id)}
            >
              Close Order
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="tab active">
      <div className="tab-header">
        <h2>Orders</h2>
        <div className="orders-header-actions">
          <button className="btn btn-secondary" onClick={handleAddMegaBuyOrder}>
            + Add Mega Buy Order
          </button>
          <button className="btn btn-primary" onClick={() => openOrderModal()}>
            + Create Order
          </button>
        </div>
      </div>

      <div className="tab-description">
        <p>
          Manage customer orders including regular orders and Mega Buy group
          orders. Track order status from Draft to Delivered or Closed states.
        </p>
      </div>

      <div className="search-box">
        <input
          type="text"
          placeholder="Search orders by person, state, id..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="orders-sections">
        <section className="orders-section">
          <h3 className="orders-section-title">Mega Buy Orders</h3>
          <div className="list-container">
            {activeMegaOrders.length === 0 ? (
              <div className="empty-message">No Mega Buy orders</div>
            ) : (
              activeMegaOrders.map(renderOrderCard)
            )}
          </div>
        </section>

        <section className="orders-section">
          <h3 className="orders-section-title">Normal Orders</h3>
          <div className="list-container">
            {activeNormalOrders.length === 0 ? (
              <div className="empty-message">No normal orders</div>
            ) : (
              activeNormalOrders.map(renderOrderCard)
            )}
          </div>
        </section>
      </div>

      {/* Archived Mega Orders */}
      {archivedMegaOrders.length > 0 && (
        <div className="archived-section">
          <button
            className="archived-toggle"
            onClick={() => setShowArchivedMega(!showArchivedMega)}
          >
            <span className="archived-toggle-icon">
              {showArchivedMega ? "▼" : "▶"}
            </span>
            <span>Archived Mega Orders</span>
            <span className="archived-count-badge">
              {archivedMegaOrders.length}
            </span>
          </button>
          {showArchivedMega && (
            <div className="list-container archived-list">
              {archivedMegaOrders.map(renderOrderCard)}
            </div>
          )}
        </div>
      )}

      {/* Archived Normal Orders */}
      {archivedNormalOrders.length > 0 && (
        <div className="archived-section">
          <button
            className="archived-toggle"
            onClick={() => setShowArchivedNormal(!showArchivedNormal)}
          >
            <span className="archived-toggle-icon">
              {showArchivedNormal ? "▼" : "▶"}
            </span>
            <span>Archived Orders</span>
            <span className="archived-count-badge">
              {archivedNormalOrders.length}
            </span>
          </button>
          {showArchivedNormal && (
            <div className="list-container archived-list">
              {archivedNormalOrders.map(renderOrderCard)}
            </div>
          )}
        </div>
      )}

      {/* Order Modal */}
      <Modal
        isOpen={orderModalOpen}
        onClose={closeOrderModal}
        title={
          editingOrderId ? `Edit Order ${editingOrderId}` : "Create New Order"
        }
      >
        <form onSubmit={handleOrderSubmit}>
          {orderModalError && (
            <div
              className="error-message"
              style={{
                color: "red",
                marginBottom: "1rem",
                padding: "0.5rem",
                backgroundColor: "#ffe6e6",
                borderRadius: "4px",
              }}
            >
              {orderModalError}
            </div>
          )}
          <div className="form-group">
            <label htmlFor="orderPersonName">Person Name *</label>
            <input
              type="text"
              id="orderPersonName"
              placeholder="e.g., Ms. Huong"
              value={orderForm.person_name}
              onChange={(e) =>
                setOrderForm({ ...orderForm, person_name: e.target.value })
              }
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="orderDate">Order Date</label>
            <input
              type="date"
              id="orderDate"
              value={orderForm.order_date}
              onChange={(e) =>
                setOrderForm({ ...orderForm, order_date: e.target.value })
              }
            />
          </div>
          {!editingOrderId && (
            <div className="form-group">
              <label htmlFor="orderSecretPhrase">
                Secret Phrase (for delete protection)
              </label>
              <input
                type="text"
                id="orderSecretPhrase"
                placeholder="e.g., my-secret-123"
                value={orderForm.secret_phrase}
                onChange={(e) =>
                  setOrderForm({ ...orderForm, secret_phrase: e.target.value })
                }
              />
            </div>
          )}

          <div className="order-items-section">
            <div className="order-items-header">
              <label>Order Items</label>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={addOrderItem}
              >
                + Add Item
              </button>
            </div>
            <div id="orderItems">
              {orderForm.items.map((item, index) => {
                const product = products.find((p) => p.id === item.product_id);
                const units = product ? getProductUnits(product) : ["carton"];
                const unitPrice = product
                  ? getUnitPrice(product, item.unit)
                  : null;
                const qty = Number(item.quantity);
                const lineTotal =
                  unitPrice !== null && qty > 0
                    ? (unitPrice * qty).toFixed(2)
                    : "0.00";

                return (
                  <div key={index} className="order-item-row">
                    <select
                      className="order-product"
                      value={item.product_id}
                      onChange={(e) =>
                        updateOrderItem(index, "product_id", e.target.value)
                      }
                    >
                      <option value="">Select product</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.id} - {p.name}
                        </option>
                      ))}
                    </select>
                    <input
                      className="order-qty"
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={item.quantity}
                      onChange={(e) =>
                        updateOrderItem(index, "quantity", e.target.value)
                      }
                    />
                    <select
                      className="order-unit"
                      value={item.unit}
                      onChange={(e) =>
                        updateOrderItem(index, "unit", e.target.value)
                      }
                    >
                      {units.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                    <span className="order-line-total">{lineTotal} kr</span>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={() => removeOrderItem(index)}
                    >
                      Remove
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="order-total">
              <strong>Total: </strong>
              <span>{calculateOrderTotal()} kr</span>
            </div>
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={closeOrderModal}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Save Order
            </button>
          </div>
        </form>
      </Modal>

      {/* Place Order Modal */}
      <Modal
        isOpen={placeOrderModalOpen}
        onClose={closePlaceOrderModal}
        title="Place Mega Buy Order"
      >
        <div className="place-order-content">
          <p>Are you sure you want to place this order?</p>
          <p>This will lock all child orders and the Mega Buy order.</p>
          <div className="place-order-details">
            <strong>Order Summary:</strong>
            <p>
              {pendingOrder
                ? formatOrderDetailsForCopy(pendingOrder.items)
                : ""}
            </p>
          </div>
          <button className="btn btn-secondary" onClick={copyOrderDetails}>
            Copy Details
          </button>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={closePlaceOrderModal}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleConfirmPlaceOrder}>
            Place Order
          </button>
        </div>
      </Modal>

      {/* Product Details Modal */}
      <Modal
        isOpen={productDetailsModalOpen}
        onClose={closeProductDetailsModal}
        title="Product Details"
      >
        {productDetailsData && (
          <div className="product-details-content">
            <div className="product-details-info">
              <strong>{productDetailsData.productInfoText}</strong>
              <small
                style={{ display: "block", color: "#fff", marginTop: "4px" }}
              >
                {productDetailsData.unitPrice} kr/unit |{" "}
                {productDetailsData.productPrice} kr/carton (
                {productDetailsData.packageQuantity} units)
              </small>
            </div>
            <div className="product-details-total">
              <strong>Total: </strong>
              {productDetailsData.totalSum || "0"}
            </div>
            <div className="product-details-breakdown">
              <strong>Breakdown by person:</strong>
              <div className="breakdown-list">
                {productDetailsData.breakdown.length > 0 ? (
                  productDetailsData.breakdown.map((b, i) => (
                    <span
                      key={i}
                      className="product-breakdown-item child-order-link"
                      onClick={() => {
                        closeProductDetailsModal();
                        const element = document.getElementById(
                          `order-${b.orderId}`,
                        );
                        if (element) {
                          element.scrollIntoView({
                            behavior: "smooth",
                            block: "center",
                          });
                          element.classList.add("highlight-order");
                          setTimeout(
                            () => element.classList.remove("highlight-order"),
                            2000,
                          );
                        }
                      }}
                    >
                      <strong>{b.personName}</strong> ({b.itemsSummary})
                    </span>
                  ))
                ) : (
                  <span className="product-breakdown-empty">
                    No orders found
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
        <div className="modal-footer">
          <button
            className="btn btn-secondary"
            onClick={closeProductDetailsModal}
          >
            Close
          </button>
        </div>
      </Modal>
    </div>
  );
}
