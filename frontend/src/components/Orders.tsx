import { useState, useMemo, FormEvent } from "react";
import { useApp } from "../context/AppContext";
import { useI18n } from "../i18n";
import Modal from "./Modal";
import {
  getProductUnits,
  getUnitPrice,
  formatOrderDate,
  getOrderStateClass,
  formatOrderItemsSummary,
  aggregateOrderItems,
  calculateOrderTotalWithVat,
  removeVietnameseTones,
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
    favoriteList,
    discountProducts,
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
    addDiscountProduct,
    removeDiscountProduct,
    clearDiscountProducts,
    getDiscountPrice,
  } = useApp();
  const { t } = useI18n();

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
    items: [{ product_id: "", quantity: 1, unit: "unit" }],
  });
  const [orderModalError, setOrderModalError] = useState<string | null>(null);
  const [discountSectionOpen, setDiscountSectionOpen] = useState(true);
  const [discountProductId, setDiscountProductId] = useState("");
  const [discountPrice, setDiscountPrice] = useState("");
  const [discountNote, setDiscountNote] = useState("");
  const [discountSearch, setDiscountSearch] = useState("");

  // Filter and sort orders
  const {
    activeMegaOrders,
    activeNormalOrders,
    archivedMegaOrders,
    archivedNormalOrders,
  } = useMemo(() => {
    const matchesSearch = (order: Order): boolean => {
      if (!searchTerm) return true;
      const term = removeVietnameseTones(searchTerm.toLowerCase());
      return (
        order.id.toLowerCase().includes(term) ||
        removeVietnameseTones(order.person_name.toLowerCase()).includes(term) ||
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
        items: [{ product_id: "", quantity: 1, unit: "unit" }],
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
        { product_id: "", quantity: 1, unit: "unit" },
        ...orderForm.items,
      ],
    });
  };

  const removeOrderItem = (index: number) => {
    if (orderForm.items.length <= 1) {
      showToast(t("orders.minOneItem"), "error");
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

      // Use discount price if available
      const discountPrice = getDiscountPrice(item.product_id);
      let unitPrice: number | null;
      if (discountPrice !== null) {
        // Discount price is the unit price
        const packageQty = product.package_quantity || 1;
        unitPrice =
          item.unit === "carton" ? discountPrice * packageQty : discountPrice;
      } else {
        unitPrice = getUnitPrice(product, item.unit);
      }

      if (unitPrice !== null) {
        total += Number((unitPrice * qty).toFixed(2));
      }
    });
    return total.toFixed(2);
  };

  const handleOrderSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!orderForm.person_name.trim()) {
      setOrderModalError(t("orders.personNameRequired"));
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
        t("orders.duplicateName").replace(
          "{name}",
          orderForm.person_name.trim(),
        ),
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
      setOrderModalError(t("orders.itemsRequired"));
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
        editingOrderId ? t("orders.orderUpdated") : t("orders.orderCreated"),
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
      let promptMessage = t("orders.enterSecretPhrase").replace(
        "{name}",
        order.person_name,
      );

      // Keep prompting until correct or cancelled
      while (true) {
        const enteredPhrase = prompt(promptMessage);
        if (enteredPhrase === null) return; // User cancelled
        secretPhrase = enteredPhrase;

        try {
          await deleteOrder(orderId, secretPhrase);
          showToast(t("orders.orderDeleted"));
          return;
        } catch (error) {
          const errorMessage = (error as Error).message;
          if (errorMessage.includes("Incorrect secret phrase")) {
            promptMessage = t("orders.wrongSecretPhrase").replace(
              "{name}",
              order.person_name,
            );
            continue;
          }
          showToast(t("toast.error") + ": " + errorMessage, "error");
          return;
        }
      }
    } else {
      const confirmMsg =
        order.order_type === "mega_buy" && order.state === "Closed"
          ? t("orders.confirmDeleteMega")
          : t("orders.confirmDeleteDraft");

      if (!confirm(confirmMsg)) return;

      try {
        await deleteOrder(orderId, secretPhrase);
        showToast(t("orders.orderDeleted"));
      } catch (error) {
        showToast(t("toast.error") + ": " + (error as Error).message, "error");
      }
    }
  };

  const handleEditOrder = (orderId: string) => {
    const order = orders.find((o) => o.id === orderId);
    if (!order) return;

    if (order.order_type === "mega_buy") {
      showToast(t("orders.cannotEditMega"), "error");
      return;
    }

    const isEditableDeliveredChild =
      order.state === "Delivered" && Boolean(order.locked_by_mega_order_id);
    if (order.state !== "Draft" && !isEditableDeliveredChild) {
      showToast(t("orders.cannotEditLocked"), "error");
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
      showToast(t("orders.needAtLeast2"), "error");
      return;
    }

    try {
      await createMegaBuyOrder(
        "Mega Buy Order",
        new Date().toISOString().split("T")[0],
        sourceOrders.map((o) => o.id),
      );
      showToast(
        t("orders.megaCreated").replace("{count}", String(sourceOrders.length)),
      );
    } catch (error) {
      showToast(t("toast.error") + ": " + (error as Error).message, "error");
    }
  };

  const handleRecalculateMegaBuy = async (orderId: string) => {
    try {
      await recalculateMegaBuyOrder(orderId);
      showToast(t("orders.megaRecalculated"));
    } catch (error) {
      showToast(t("toast.error") + ": " + (error as Error).message, "error");
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
      showToast(t("orders.megaPlaced"));
      closePlaceOrderModal();
    } catch (error) {
      showToast(t("toast.error") + ": " + (error as Error).message, "error");
    }
  };

  const handleDeliverMegaBuy = async (orderId: string) => {
    if (!confirm(t("orders.confirmDeliver"))) {
      return;
    }

    try {
      await deliverMegaBuyOrder(orderId);
      showToast(t("orders.megaDelivered"));
    } catch (error) {
      showToast(t("toast.error") + ": " + (error as Error).message, "error");
    }
  };

  const handleCloseMegaBuy = async (orderId: string) => {
    if (!confirm(t("orders.confirmClose"))) {
      return;
    }

    try {
      await closeMegaBuyOrder(orderId);
      showToast(t("orders.megaClosed"));
    } catch (error) {
      showToast(t("toast.error") + ": " + (error as Error).message, "error");
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
        showToast(t("toast.copiedToClipboard"));
      })
      .catch(() => {
        showToast(t("toast.copyFailed"), "error");
      });
  };

  // Product details modal for Mega orders
  const showProductDetails = (megaOrderId: string, productId: string) => {
    const megaOrder = orders.find((o) => o.id === megaOrderId);
    const product = products.find((p) => p.id === productId);

    if (!megaOrder || !product) {
      showToast(t("common.noResults"), "error");
      return;
    }

    // Find the mega order item for this product
    const megaItem = megaOrder.items.find(
      (item) => item.product_id === productId,
    );

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
    const showCartonInfo = isPackageProduct && packageQuantity > 1;
    const productInfoText = showCartonInfo
      ? `${product.id} - ${product.name}: carton × ${packageQuantity} ${packageUnit}`
      : `${product.id} - ${product.name}`;

    const breakdown: Array<{
      personName: string;
      orderId: string;
      itemsSummary: string;
      createdAt: string;
    }> = [];
    const totalByUnit = new Map<string, number>();

    // Collect items with their created_at for sorting
    const itemsWithInfo: Array<{
      personName: string;
      orderId: string;
      item: OrderItem;
      createdAt: string;
    }> = [];

    childOrders.forEach((order) => {
      const orderItems = order.items.filter(
        (item) => item.product_id === productId,
      );
      orderItems.forEach((item) => {
        itemsWithInfo.push({
          personName: order.person_name,
          orderId: order.id,
          item,
          // Use item's created_at if available, fall back to order's created_at
          createdAt: item.created_at || order.created_at || "",
        });
      });
    });

    // Sort by item's created_at (oldest first)
    itemsWithInfo.sort((a, b) => {
      const dateA = new Date(a.createdAt || 0).getTime();
      const dateB = new Date(b.createdAt || 0).getTime();
      return dateA - dateB;
    });

    // Build breakdown from sorted items
    itemsWithInfo.forEach(({ personName, orderId, item, createdAt }) => {
      const qty = Number(item.quantity) || 0;
      let unit = (item.unit || "unit").toLowerCase();
      // For package_quantity=1, convert "carton" to packageUnit
      if (packageQuantity === 1 && unit === "carton") {
        unit = packageUnit;
      }
      totalByUnit.set(
        unit,
        Number(((totalByUnit.get(unit) || 0) + qty).toFixed(2)),
      );
      breakdown.push({
        personName,
        orderId,
        itemsSummary: `${qty} ${unit}`,
        createdAt,
      });
    });

    const totalSum = Array.from(totalByUnit.entries())
      .map(([unit, qty]: [string, number]) => `${qty} ${unit}`)
      .join(", ");

    // product.price is the unit price; calculate carton price
    const unitPrice = product.price;
    const cartonPrice = Number((product.price * packageQuantity).toFixed(2));

    // Check for discount price
    const discountPrice = getDiscountPrice(productId);
    const discountUnitPrice = discountPrice;
    const discountCartonPrice = discountPrice
      ? Number((discountPrice * packageQuantity).toFixed(2))
      : null;

    // Extract contributors from mega order item (sorted by priority from backend)
    const contributors = megaItem?.contributors?.map((c) => ({
      personName: c.person_name,
      orderId: c.order_id,
      quantity: c.quantity,
      unit: c.unit,
      smallUnits: c.small_units,
      orderedAt: c.ordered_at,
      protected: c.protected,
    }));

    setProductDetailsData({
      productInfoText,
      totalSum,
      breakdown,
      productId,
      productPrice: cartonPrice,
      unitPrice,
      packageQuantity,
      discountUnitPrice,
      discountCartonPrice,
      contributors,
      hasRemainder: megaItem?.has_remainder,
      remainderQuantity: megaItem?.remainder_quantity,
      remainderUnit: megaItem?.remainder_unit,
      isRemainder: megaItem?.is_remainder,
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
      return (
        <div className="mega-products-empty">{t("orders.noProducts")}</div>
      );
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
      // For package_quantity = 1, convert "carton" to "unit"
      const displayUnits = new Map(group.units);
      if (group.packageQuantity === 1 && displayUnits.has("carton")) {
        const cartonQty = displayUnits.get("carton") || 0;
        displayUnits.delete("carton");
        displayUnits.set(
          group.packageUnit,
          (displayUnits.get(group.packageUnit) || 0) + cartonQty,
        );
      }

      const unitSummary = Array.from(displayUnits.entries())
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

    // Calculate totals with discount prices
    let totalAmount = 0;
    let totalWithVat = 0;
    order.items.forEach((item) => {
      const product = products.find((p) => p.id === item.product_id);
      if (!product) return;

      const packageQty = product.package_quantity || 1;
      const discountPrice = getDiscountPrice(item.product_id);
      const baseUnitPrice =
        discountPrice !== null ? discountPrice : Number(product.price);

      // Calculate line total based on unit
      const isCarton = item.unit?.toLowerCase() === "carton";
      const lineTotal = isCarton
        ? baseUnitPrice * packageQty * item.quantity
        : baseUnitPrice * item.quantity;

      totalAmount += lineTotal;

      // Add VAT
      const vat = getCategoryVat(product.category_id);
      totalWithVat += calculatePriceWithVat(lineTotal, vat);
    });

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
              {t(`orders.states.${order.state.toLowerCase()}`)}
            </span>
            {isMegaBuy && <span className="selling-type-badge">Mega Buy</span>}
          </div>
          {isMegaBuy && (
            <p>
              <strong>{t("orders.personName")}:</strong> {order.person_name}
            </p>
          )}
          <p>
            <strong>{t("orders.orderDate")}:</strong>{" "}
            {formatOrderDate(order.updated_at || order.order_date)}
          </p>
          <p>
            <strong>{t("orders.orderItems")}:</strong> {order.items.length}
          </p>
          <p>
            <strong>{t("common.total")}:</strong> {totalAmount.toFixed(2)} kr{" "}
            <span className="total-vat-text">
              ({totalWithVat.toFixed(2)} kr {t("common.inclVat")})
            </span>
          </p>
          {isMegaBuy ? (
            <>
              {order.delivered_at && (
                <p>
                  <strong>{t("orders.deliver")}:</strong>{" "}
                  {formatOrderDate(order.delivered_at)}
                </p>
              )}
              <div className="mega-order-section">
                <strong>{t("orders.normalOrders")}:</strong>
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
                            title={childOrder?.person_name || id}
                          >
                            {childOrder?.person_name || id}
                          </span>
                        );
                      })
                    : "N/A"}
                </div>
              </div>
              <div className="mega-order-section">
                <strong>{t("products.title")}:</strong>
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
              {t("common.edit")}
            </button>
          )}
          {(order.state === "Draft" ||
            (isMegaBuy && order.state === "Closed")) && (
            <button
              className="btn btn-danger"
              onClick={() => handleDeleteOrder(order.id)}
            >
              {t("common.delete")}
            </button>
          )}
          {(order.state === "Draft" || order.state === "Delivered") &&
            isMegaBuy && (
              <button
                className="btn btn-dark"
                onClick={() => handleRecalculateMegaBuy(order.id)}
              >
                {t("orders.recalculate")}
              </button>
            )}
          {order.state === "Draft" && isMegaBuy && (
            <button
              className="btn btn-primary"
              onClick={() => openPlaceOrderModal(order.id)}
            >
              {t("orders.placeOrder")}
            </button>
          )}
          {order.state === "Locked" && isMegaBuy && (
            <button
              className="btn btn-primary"
              onClick={() => handleDeliverMegaBuy(order.id)}
            >
              {t("orders.deliver")}
            </button>
          )}
          {order.state === "Delivered" && isMegaBuy && (
            <button
              className="btn btn-primary"
              onClick={() => handleCloseMegaBuy(order.id)}
            >
              {t("orders.closeOrder")}
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="tab active">
      <div className="tab-header">
        <h2>{t("orders.title")}</h2>
        <div className="orders-header-actions">
          <button className="btn btn-secondary" onClick={handleAddMegaBuyOrder}>
            + {t("orders.createMegaBuy")}
          </button>
          <button className="btn btn-primary" onClick={() => openOrderModal()}>
            + {t("orders.newOrder")}
          </button>
        </div>
      </div>

      <div className="tab-description">
        <p>{t("orders.description")}</p>
      </div>

      <div className="search-box">
        <input
          type="text"
          placeholder={t("common.searchOrders")}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Discount Products Section */}
      <div className="discount-section">
        <button
          className="discount-toggle"
          onClick={() => setDiscountSectionOpen(!discountSectionOpen)}
        >
          <span className="discount-toggle-icon">
            {discountSectionOpen ? "▼" : "▶"}
          </span>
          <span>{t("orders.discountProducts")}</span>
          {discountProducts.length > 0 && (
            <span className="discount-count-badge">
              {discountProducts.length}
            </span>
          )}
        </button>

        {discountSectionOpen && (
          <div className="discount-content">
            <div className="discount-form">
              <div className="discount-form-row">
                <div className="discount-product-search">
                  <input
                    type="text"
                    placeholder={t("orders.searchProduct")}
                    value={discountSearch}
                    onChange={(e) => setDiscountSearch(e.target.value)}
                    list="discount-product-list"
                  />
                  <datalist id="discount-product-list">
                    {products
                      .filter(
                        (p) =>
                          !discountSearch ||
                          p.name
                            .toLowerCase()
                            .includes(discountSearch.toLowerCase()) ||
                          p.id
                            .toLowerCase()
                            .includes(discountSearch.toLowerCase()),
                      )
                      .slice(0, 20)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.price} kr)
                        </option>
                      ))}
                  </datalist>
                </div>
                <select
                  className="discount-product-select"
                  value={discountProductId}
                  onChange={(e) => {
                    setDiscountProductId(e.target.value);
                    const product = products.find(
                      (p) => p.id === e.target.value,
                    );
                    if (product) {
                      setDiscountPrice(String(product.price));
                    }
                  }}
                >
                  <option value="">{t("orders.selectProduct")}</option>
                  {products
                    .filter(
                      (p) =>
                        !discountSearch ||
                        p.name
                          .toLowerCase()
                          .includes(discountSearch.toLowerCase()) ||
                        p.id
                          .toLowerCase()
                          .includes(discountSearch.toLowerCase()),
                    )
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.id} - {p.name} ({p.price} kr)
                      </option>
                    ))}
                </select>
                <input
                  type="number"
                  className="discount-price-input"
                  placeholder={t("orders.discountPrice")}
                  value={discountPrice}
                  onChange={(e) => setDiscountPrice(e.target.value)}
                  step="0.01"
                  min="0"
                />
                <input
                  type="text"
                  className="discount-note-input"
                  placeholder={t("orders.note")}
                  value={discountNote}
                  onChange={(e) => setDiscountNote(e.target.value)}
                />
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    if (discountProductId && discountPrice) {
                      addDiscountProduct(
                        discountProductId,
                        parseFloat(discountPrice),
                        discountNote || undefined,
                      );
                      setDiscountProductId("");
                      setDiscountPrice("");
                      setDiscountNote("");
                      setDiscountSearch("");
                    }
                  }}
                  disabled={!discountProductId || !discountPrice}
                >
                  {t("common.add")}
                </button>
              </div>
            </div>

            {discountProducts.length > 0 && (
              <>
                <div className="discount-list">
                  <table className="discount-table">
                    <thead>
                      <tr>
                        <th>{t("orders.productCode")}</th>
                        <th>{t("orders.productName")}</th>
                        <th>{t("orders.originalPrice")}</th>
                        <th>{t("orders.discountPrice")}</th>
                        <th>{t("orders.note")}</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {discountProducts.map((d) => (
                        <tr key={d.product_id}>
                          <td>{d.product_id}</td>
                          <td>{d.product_name}</td>
                          <td className="price-original">
                            {d.original_price} kr
                          </td>
                          <td className="price-discount">
                            {d.discount_price} kr
                          </td>
                          <td>{d.note || "-"}</td>
                          <td>
                            <button
                              className="btn btn-danger btn-sm"
                              onClick={() =>
                                removeDiscountProduct(d.product_id)
                              }
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="discount-actions">
                  <button
                    className="btn btn-danger"
                    onClick={() => {
                      if (window.confirm(t("orders.confirmClearDiscounts"))) {
                        clearDiscountProducts();
                      }
                    }}
                  >
                    {t("orders.clearAllDiscounts")}
                  </button>
                </div>
              </>
            )}

            {discountProducts.length === 0 && (
              <div className="discount-empty">{t("orders.noDiscountsYet")}</div>
            )}
          </div>
        )}
      </div>

      <div className="orders-sections">
        <section className="orders-section">
          <h3 className="orders-section-title">{t("orders.megaBuyOrders")}</h3>
          <div className="list-container">
            {activeMegaOrders.length === 0 ? (
              <div className="empty-message">{t("common.noResults")}</div>
            ) : (
              activeMegaOrders.map(renderOrderCard)
            )}
          </div>
        </section>

        <section className="orders-section">
          <h3 className="orders-section-title">{t("orders.normalOrders")}</h3>
          <div className="list-container">
            {activeNormalOrders.length === 0 ? (
              <div className="empty-message">{t("common.noResults")}</div>
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
            <span>{t("orders.archivedOrders")} (Mega)</span>
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
            <span>{t("orders.archivedOrders")}</span>
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
          editingOrderId
            ? `${t("orders.editOrder")} ${editingOrderId}`
            : t("orders.newOrder")
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
            <label htmlFor="orderPersonName">{t("orders.personName")} *</label>
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
            <label htmlFor="orderDate">{t("orders.orderDate")}</label>
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
                {t("orders.secretPhrase")}
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
              <label>{t("orders.orderItems")}</label>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={addOrderItem}
              >
                {t("orders.addItem")}
              </button>
            </div>
            <div id="orderItems">
              {orderForm.items.map((item, index) => {
                const product = products.find((p) => p.id === item.product_id);
                const units = product ? getProductUnits(product) : ["carton"];

                // Use discount price if available
                const discountPrice = getDiscountPrice(item.product_id);
                let unitPrice: number | null = null;
                let originalUnitPrice: number | null = null;
                let hasDiscount = false;
                if (product) {
                  originalUnitPrice = getUnitPrice(product, item.unit);
                  if (discountPrice !== null) {
                    hasDiscount = true;
                    const packageQty = product.package_quantity || 1;
                    unitPrice =
                      item.unit === "carton"
                        ? discountPrice * packageQty
                        : discountPrice;
                  } else {
                    unitPrice = originalUnitPrice;
                  }
                }

                const qty = Number(item.quantity);
                const lineTotal =
                  unitPrice !== null && qty > 0
                    ? (unitPrice * qty).toFixed(2)
                    : "0.00";
                const originalLineTotal =
                  hasDiscount && originalUnitPrice !== null && qty > 0
                    ? (originalUnitPrice * qty).toFixed(2)
                    : null;

                return (
                  <div key={index} className="order-item-row">
                    <select
                      className="order-product"
                      value={item.product_id}
                      title={
                        item.product_id
                          ? `${item.product_id} - ${products.find((p) => p.id === item.product_id)?.name || ""}${hasDiscount ? " (Discount)" : ""}`
                          : ""
                      }
                      onChange={(e) =>
                        updateOrderItem(index, "product_id", e.target.value)
                      }
                    >
                      <option value="">{t("orders.selectProduct")}</option>
                      {(() => {
                        // Get discount product IDs
                        const discountProductIds = new Set(
                          discountProducts.map((d) => d.product_id),
                        );
                        // Discount products
                        const discountItems = products.filter((p) =>
                          discountProductIds.has(p.id),
                        );
                        const inList = products.filter(
                          (p) =>
                            favoriteList.includes(p.id) &&
                            !discountProductIds.has(p.id),
                        );
                        const notInList = products.filter(
                          (p) =>
                            !favoriteList.includes(p.id) &&
                            !discountProductIds.has(p.id),
                        );
                        return (
                          <>
                            {discountItems.length > 0 && (
                              <optgroup label={t("orders.discountProducts")}>
                                {discountItems.map((p) => {
                                  const discount = discountProducts.find(
                                    (d) => d.product_id === p.id,
                                  );
                                  return (
                                    <option
                                      key={p.id}
                                      value={p.id}
                                      title={`${p.id} - ${p.name} (${discount?.discount_price} kr)`}
                                    >
                                      {p.id} - {p.name} ★
                                    </option>
                                  );
                                })}
                              </optgroup>
                            )}
                            {inList.length > 0 && (
                              <optgroup label={t("orders.favoriteList")}>
                                {inList.map((p) => (
                                  <option
                                    key={p.id}
                                    value={p.id}
                                    title={`${p.id} - ${p.name}`}
                                  >
                                    {p.id} - {p.name}
                                  </option>
                                ))}
                              </optgroup>
                            )}
                            {notInList.length > 0 && (
                              <optgroup label={t("orders.allProducts")}>
                                {notInList.map((p) => (
                                  <option
                                    key={p.id}
                                    value={p.id}
                                    title={`${p.id} - ${p.name}`}
                                  >
                                    {p.id} - {p.name}
                                  </option>
                                ))}
                              </optgroup>
                            )}
                          </>
                        );
                      })()}
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
                    <span
                      className={`order-line-total ${hasDiscount ? "has-discount" : ""}`}
                      title={hasDiscount ? "Discount price applied" : ""}
                    >
                      {hasDiscount && originalLineTotal && (
                        <span className="original-price">
                          {originalLineTotal} kr
                        </span>
                      )}
                      <span className={hasDiscount ? "discount-price" : ""}>
                        {lineTotal} kr
                      </span>
                    </span>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={() => removeOrderItem(index)}
                    >
                      {t("common.remove")}
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="order-total">
              <strong>{t("common.total")}: </strong>
              <span>{calculateOrderTotal()} kr</span>
            </div>
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={closeOrderModal}
            >
              {t("common.cancel")}
            </button>
            <button type="submit" className="btn btn-primary">
              {t("common.save")}
            </button>
          </div>
        </form>
      </Modal>

      {/* Place Order Modal */}
      <Modal
        isOpen={placeOrderModalOpen}
        onClose={closePlaceOrderModal}
        title={t("orders.placeOrderModal.title")}
      >
        <div className="place-order-content">
          <p>{t("orders.placeOrderModal.confirmText")}</p>
          <div className="place-order-details">
            <strong>{t("orders.placeOrderModal.products")}:</strong>
            <p>
              {pendingOrder
                ? formatOrderDetailsForCopy(pendingOrder.items)
                : ""}
            </p>
          </div>
          <button className="btn btn-secondary" onClick={copyOrderDetails}>
            {t("common.copyToClipboard")}
          </button>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={closePlaceOrderModal}>
            {t("common.cancel")}
          </button>
          <button className="btn btn-primary" onClick={handleConfirmPlaceOrder}>
            {t("orders.placeOrder")}
          </button>
        </div>
      </Modal>

      {/* Product Details Modal */}
      <Modal
        isOpen={productDetailsModalOpen}
        onClose={closeProductDetailsModal}
        title={t("orders.productDetails.title")}
      >
        {productDetailsData && (
          <div className="product-details-content">
            <div className="product-details-info">
              <strong>{productDetailsData.productInfoText}</strong>
              <small
                style={{ display: "block", color: "#fff", marginTop: "4px" }}
              >
                {productDetailsData.discountUnitPrice ? (
                  <>
                    <span
                      className="original-price"
                      style={{
                        textDecoration: "line-through",
                        color: "#a0aec0",
                        marginRight: "4px",
                      }}
                    >
                      {productDetailsData.unitPrice} kr
                    </span>
                    <span style={{ color: "#68d391" }}>
                      {productDetailsData.discountUnitPrice} kr
                    </span>
                    /{t("orders.unit")}
                    {productDetailsData.packageQuantity > 1 && (
                      <>
                        {" | "}
                        <span
                          className="original-price"
                          style={{
                            textDecoration: "line-through",
                            color: "#a0aec0",
                            marginRight: "4px",
                          }}
                        >
                          {productDetailsData.productPrice} kr
                        </span>
                        <span style={{ color: "#68d391" }}>
                          {productDetailsData.discountCartonPrice} kr
                        </span>
                        /carton ({productDetailsData.packageQuantity}{" "}
                        {t("orders.unit")})
                      </>
                    )}
                  </>
                ) : (
                  <>
                    {productDetailsData.unitPrice} kr/{t("orders.unit")}
                    {productDetailsData.packageQuantity > 1 && (
                      <>
                        {" | "}
                        {productDetailsData.productPrice} kr/carton (
                        {productDetailsData.packageQuantity} {t("orders.unit")})
                      </>
                    )}
                  </>
                )}
              </small>
            </div>
            <div className="product-details-total">
              <strong>{t("common.total")}: </strong>
              {productDetailsData.totalSum || "0"}
            </div>
            <div className="product-details-breakdown">
              <strong>{t("orders.productDetails.orderedBy")}:</strong>
              {productDetailsData.contributors &&
              productDetailsData.contributors.length > 0 ? (
                <div className="breakdown-list">
                  {productDetailsData.contributors.map((c, i) => {
                    const isLast =
                      i === productDetailsData.contributors!.length - 1;
                    const isCutCandidate =
                      productDetailsData.isRemainder && !c.protected;
                    return (
                      <span
                        key={i}
                        className={`product-breakdown-item child-order-link ${isCutCandidate ? "cut-candidate" : ""}`}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "4px 8px",
                          marginBottom: "4px",
                          borderRadius: "4px",
                          backgroundColor: c.protected
                            ? "rgba(72, 187, 120, 0.2)"
                            : isCutCandidate
                              ? "rgba(245, 101, 101, 0.2)"
                              : "transparent",
                        }}
                        onClick={() => {
                          closeProductDetailsModal();
                          const element = document.getElementById(
                            `order-${c.orderId}`,
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
                        <span>
                          <strong>{c.personName}</strong> ({c.quantity} {c.unit}
                          )
                        </span>
                        <span style={{ fontSize: "0.8em", color: "#a0aec0" }}>
                          {c.protected && (
                            <span
                              style={{
                                backgroundColor: "#48bb78",
                                color: "#fff",
                                padding: "2px 6px",
                                borderRadius: "4px",
                                marginRight: "4px",
                              }}
                            >
                              {t("orders.productDetails.protected")}
                            </span>
                          )}
                          {isCutCandidate && isLast && (
                            <span
                              style={{
                                backgroundColor: "#f56565",
                                color: "#fff",
                                padding: "2px 6px",
                                borderRadius: "4px",
                                marginRight: "4px",
                              }}
                            >
                              {t("orders.productDetails.cutCandidate")}
                            </span>
                          )}
                          {new Date(c.orderedAt).toLocaleString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </span>
                      </span>
                    );
                  })}
                </div>
              ) : (
                <div className="breakdown-list">
                  {productDetailsData.breakdown.length > 0 ? (
                    productDetailsData.breakdown.map((b, i) => (
                      <span
                        key={i}
                        className="product-breakdown-item child-order-link"
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "4px 8px",
                          marginBottom: "4px",
                        }}
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
                        <span>
                          <strong>{b.personName}</strong> ({b.itemsSummary})
                        </span>
                        <span style={{ fontSize: "0.8em", color: "#a0aec0" }}>
                          {b.createdAt &&
                            new Date(b.createdAt).toLocaleString(undefined, {
                              month: "short",
                              day: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                        </span>
                      </span>
                    ))
                  ) : (
                    <span className="product-breakdown-empty">
                      {t("common.noResults")}
                    </span>
                  )}
                </div>
              )}
              {productDetailsData.hasRemainder && (
                <div
                  style={{
                    marginTop: "8px",
                    padding: "8px",
                    backgroundColor: "rgba(237, 137, 54, 0.2)",
                    borderRadius: "4px",
                  }}
                >
                  <strong style={{ color: "#ed8936" }}>
                    {t("orders.productDetails.remainder")}:
                  </strong>{" "}
                  {productDetailsData.remainderQuantity}{" "}
                  {productDetailsData.remainderUnit}
                </div>
              )}
            </div>
          </div>
        )}
        <div className="modal-footer">
          <button
            className="btn btn-secondary"
            onClick={closeProductDetailsModal}
          >
            {t("common.close")}
          </button>
        </div>
      </Modal>
    </div>
  );
}
