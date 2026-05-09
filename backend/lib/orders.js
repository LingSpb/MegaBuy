/**
 * Order data access layer for MegaBuy
 */

const supabase = require("./supabase");

async function fetchOrders() {
  const { data: orders, error: ordersError } = await supabase
    .from("orders")
    .select("*")
    .order("created_at", { ascending: true })
    .range(0, 9999);
  if (ordersError) throw ordersError;

  // Fetch all order items
  const { data: allItems, error: itemsError } = await supabase
    .from("order_items")
    .select("*")
    .order("sort_order", { ascending: true })
    .range(0, 99999);
  if (itemsError) throw itemsError;

  // Group items by order_id
  const itemsByOrder = {};
  for (const item of allItems) {
    if (!itemsByOrder[item.order_id]) {
      itemsByOrder[item.order_id] = [];
    }
    itemsByOrder[item.order_id].push({
      product_id: item.product_id,
      product_name: item.product_name,
      quantity: Number(item.quantity),
      unit: item.unit,
      unit_price: item.unit_price != null ? Number(item.unit_price) : null,
      line_total: item.line_total != null ? Number(item.line_total) : null,
    });
  }

  return orders.map((order) => {
    const { secret_phrase, ...rest } = order;
    return {
      ...rest,
      has_secret_phrase: Boolean(secret_phrase),
      items: itemsByOrder[order.id] || [],
    };
  });
}

async function fetchOrderById(orderId) {
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .single();
  if (orderError) return null;

  const { data: items, error: itemsError } = await supabase
    .from("order_items")
    .select("*")
    .eq("order_id", orderId)
    .order("sort_order", { ascending: true });
  if (itemsError) throw itemsError;

  return {
    ...order,
    items: (items || []).map((item) => ({
      product_id: item.product_id,
      product_name: item.product_name,
      quantity: Number(item.quantity),
      unit: item.unit,
      unit_price: item.unit_price != null ? Number(item.unit_price) : null,
      line_total: item.line_total != null ? Number(item.line_total) : null,
    })),
  };
}

async function saveOrderItems(orderId, items) {
  // Delete existing items
  const { error: deleteError } = await supabase
    .from("order_items")
    .delete()
    .eq("order_id", orderId);
  if (deleteError) throw deleteError;

  // Insert new items
  if (items.length > 0) {
    const rows = items.map((item, index) => ({
      order_id: orderId,
      product_id: item.product_id,
      product_name: item.product_name,
      quantity: item.quantity,
      unit: item.unit,
      unit_price: item.unit_price,
      line_total: item.line_total,
      sort_order: index,
    }));

    const { error: insertError } = await supabase
      .from("order_items")
      .insert(rows);
    if (insertError) throw insertError;
  }
}

module.exports = {
  fetchOrders,
  fetchOrderById,
  saveOrderItems,
};
