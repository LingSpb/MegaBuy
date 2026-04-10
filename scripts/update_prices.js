/**
 * Script to update product prices from new price list
 * Usage: node scripts/update_prices.js
 * 
 * This script updates unit prices for products. For package products,
 * the carton price will be calculated as unit_price * package_quantity.
 */

require('dotenv').config();
const supabase = require('../lib/supabase');

// New prices from the price list (unit prices)
const priceUpdates = [
  { name: 'Vit fille', unit_price: 67.9 },
  { name: 'Muc', unit_price: 104.9 },
  { name: 'Bap bo dong da', unit_price: 99.9 },
  { name: 'Bánh bao custard Bun 250g', unit_price: 20.9 },
  { name: 'Bánh rán nhân custard 200g', unit_price: 19.9 },
  { name: 'Siu mai 960g', unit_price: 115 },
  { name: 'Khoai mỡ tím đông đá', unit_price: 22.9 },
  { name: 'Tôm đông đá black tiger size 8-12', unit_price: 159 },
  { name: 'Banh da nem re', unit_price: 39.9 },
  { name: 'Khoai lang Nhật 500g', unit_price: 17 },
  { name: 'Chả cá thát lát đông đá gói 400g', unit_price: 61.9 },
  { name: 'Ngo co vo', unit_price: 31.9 },
  { name: 'Khoai tây xúc xích corndog 200g 1 gói', unit_price: 37.9 },
  { name: 'Bánh bao nhân đỗ đỏ 360g 1 gói', unit_price: 25.9 },
  { name: 'Bánh bao nhân khoai môn 250g 1 gói', unit_price: 20.5 },
  { name: 'Bánh bao mini Bun ko nhân 500g 1 gói', unit_price: 20.9 },
  { name: 'Bò yakiniku 2kg/pack', unit_price: 237.9 },
  { name: 'Mít đông đá 300g 1 túi', unit_price: 19.9 },
  { name: 'Dừa non nguyên miếng 1kg D aroy', unit_price: 85.9 },
  { name: 'Ga gia 1.8kg', unit_price: 36.5 },
  { name: 'Tôm Ebi fry 35gx10pcs 1 gói', unit_price: 35.9 },
  { name: 'Vit nguyen con', unit_price: 143 },
  { name: 'Lươn tươi đông đá 500g', unit_price: 59.9 },
  { name: 'Bánh da lợn đông đá 250g', unit_price: 14 },
  { name: 'Dừa non nạo sợi đông đá', unit_price: 17.9 },
  { name: 'Cá diêu hồng', unit_price: 43.5 },
  { name: 'Tràng lợn 800g', unit_price: 57.9 },
  { name: 'Gà karaage kentucky style 1kg 1 gói', unit_price: 110 },
  { name: 'Xách bò 800g', unit_price: 76.5 },
  { name: 'Nuoc dua', unit_price: 18.9 },
  { name: 'Lọ sốt xá xíu', unit_price: 33.9 },
  { name: 'Bun bo Hue 3 cay tre', unit_price: 15.9 },
  { name: 'Dau hao to', unit_price: 25.9 },
  { name: 'Mì hảo hảo tôm chua cay', unit_price: 102 },
  { name: 'Gao ST25 18 kg', unit_price: 315 },
  { name: 'Bánh gạo khô tokkboki 600g 1 gói', unit_price: 31.9 },
  { name: 'Đỗ xanh gói 400g', unit_price: 13.9 },
  { name: 'Phồng tôm gói 1kg', unit_price: 28.9 },
  { name: 'Bột năng', unit_price: 7.5 },
  { name: 'Bun ba cay tre', unit_price: 14 },
  { name: 'Dua chua Lotus', unit_price: 10.5 },
  { name: 'Lac hong co vo', unit_price: 24.9 },
  { name: 'Măng nứa 1kg', unit_price: 26.9 },
  { name: 'Mì tương đen chapagetti', unit_price: 209 },
  { name: 'Mì HQ Buldak carbonara gói hồng', unit_price: 599 },
  { name: 'Tương ớt Pantai', unit_price: 35.9 },
  { name: 'Hạt đác lon 625g', unit_price: 29.9 },
  { name: 'Nước cốt dừa Aroy D 1l', unit_price: 28.9 },
  { name: 'Bột gạo tẻ 400g', unit_price: 8.9 },
  { name: 'Bột nếp Vĩnh Thuận', unit_price: 12.9 },
  { name: 'Móng dừa 565g (Hạt thốt nốt 565g)', unit_price: 29.9 },
  { name: 'Vừng trắng gói 454g', unit_price: 38.9 },
  { name: 'Mì HQ Shin Ramyun đỏ cay', unit_price: 189 },
  { name: 'Mayonaise Nhật 450gr', unit_price: 48.9 },
  { name: 'Mi lau thai', unit_price: 125 },
  { name: 'Gao nep cai hoa vang 5kg', unit_price: 136 },
  { name: 'Magi thanh diu', unit_price: 18.5 },
  { name: 'Bột bánh xèo', unit_price: 13.3 },
  { name: 'Xốt Tomyum 454gr', unit_price: 42.9 },
  { name: 'Bột chiên xù 1kg', unit_price: 42.9 },
  { name: 'Nam dui ga', unit_price: 57.9 },
  { name: 'Kimchi HQ Jongga gói 500g', unit_price: 49.9 },
  { name: 'Nam kim cham', unit_price: 5.5 },
  { name: 'Giá', unit_price: 79.9 },
  { name: 'Mien dong', unit_price: 16.9 },
];

async function updatePrices() {
  console.log('Starting price update...\n');

  // Get all products from database
  const { data: products, error: fetchError } = await supabase
    .from('products')
    .select('*');

  if (fetchError) {
    console.error('Error fetching products:', fetchError.message);
    return;
  }

  console.log(`Found ${products.length} products in database\n`);

  let updated = 0;
  let notFound = 0;
  let errors = 0;

  for (const update of priceUpdates) {
    // Try to find product by exact name match (case-insensitive)
    let product = products.find(p => 
      p.name.toLowerCase() === update.name.toLowerCase()
    );

    // If not found, try partial match
    if (!product) {
      product = products.find(p => 
        p.name.toLowerCase().includes(update.name.toLowerCase()) ||
        update.name.toLowerCase().includes(p.name.toLowerCase())
      );
    }

    if (!product) {
      console.log(`❌ NOT FOUND: "${update.name}"`);
      notFound++;
      continue;
    }

    // Calculate prices based on selling type
    const unitPrice = Number(update.unit_price.toFixed(2));
    let cartonPrice = unitPrice;
    
    if (product.selling_type === 'package') {
      const packageQuantity = product.package_quantity || 1;
      cartonPrice = Number((unitPrice * packageQuantity).toFixed(2));
    }

    // Update the product
    const updateData = {
      price: cartonPrice,
      unit_price: product.selling_type === 'package' ? unitPrice : null
    };

    const { error: updateError } = await supabase
      .from('products')
      .update(updateData)
      .eq('id', product.id);

    if (updateError) {
      console.log(`❌ ERROR updating "${product.name}": ${updateError.message}`);
      errors++;
    } else {
      const priceInfo = product.selling_type === 'package' 
        ? `unit: ${unitPrice} kr, carton: ${cartonPrice} kr (×${product.package_quantity})`
        : `${unitPrice} kr`;
      console.log(`✅ UPDATED: "${product.name}" → ${priceInfo}`);
      updated++;
    }
  }

  console.log('\n========== SUMMARY ==========');
  console.log(`Total updates attempted: ${priceUpdates.length}`);
  console.log(`✅ Successfully updated: ${updated}`);
  console.log(`❌ Not found: ${notFound}`);
  console.log(`❌ Errors: ${errors}`);
}

updatePrices().catch(console.error);
