import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // ─── WHOLESALERS ───
  const wholesalers = await Promise.all([
    prisma.wholesaler.create({
      data: {
        wholesalerId: 'WS001',
        name: 'Premium Vape Distributors',
        businessName: 'Premium Vape Distributors LLC',
        taxId: '82-1234567',
        licenseNumber: 'WHL-2024-001',
        licenseState: 'CA',
        contactName: 'James Rodriguez',
        contactEmail: 'james@premiumvape.com',
        contactPhone: '310-555-0101',
        address: '1200 Commerce Dr',
        city: 'Los Angeles',
        state: 'CA',
        zipCode: '90015',
        businessType: 'Vape & Accessories',
        paymentTerms: 'NET30',
        minimumOrderValue: 100,
        shippingMethods: ['UPS Ground', 'FedEx Express'],
        status: 'ACTIVE',
        ratingAvg: 4.7,
        ratingCount: 156,
        isVerified: true,
      },
    }),
    prisma.wholesaler.create({
      data: {
        wholesalerId: 'WS002',
        name: 'Glass Warehouse Supply',
        businessName: 'Glass Warehouse Supply Co',
        taxId: '83-2345678',
        licenseNumber: 'WHL-2024-002',
        licenseState: 'CO',
        contactName: 'Emily Chen',
        contactEmail: 'emily@glasswarehouse.com',
        contactPhone: '720-555-0202',
        address: '450 Glassworks Blvd',
        city: 'Denver',
        state: 'CO',
        zipCode: '80205',
        businessType: 'Glass & Accessories',
        paymentTerms: 'NET30',
        minimumOrderValue: 50,
        shippingMethods: ['UPS Ground', 'USPS Priority'],
        status: 'ACTIVE',
        ratingAvg: 4.5,
        ratingCount: 98,
        isVerified: true,
      },
    }),
    prisma.wholesaler.create({
      data: {
        wholesalerId: 'WS003',
        name: 'Smoker Essentials Wholesale',
        businessName: 'Smoker Essentials Inc',
        taxId: '84-3456789',
        licenseNumber: 'WHL-2024-003',
        licenseState: 'TX',
        contactName: 'Marcus Johnson',
        contactEmail: 'marcus@smokeressentials.com',
        contactPhone: '214-555-0303',
        address: '789 Wholesale Way',
        city: 'Dallas',
        state: 'TX',
        zipCode: '75201',
        businessType: 'Full Catalog',
        paymentTerms: 'NET15',
        minimumOrderValue: 75,
        shippingMethods: ['FedEx Ground', 'UPS Ground'],
        status: 'ACTIVE',
        ratingAvg: 4.2,
        ratingCount: 72,
        isVerified: true,
      },
    }),
    prisma.wholesaler.create({
      data: {
        wholesalerId: 'WS004',
        name: 'CBD Direct Distribution',
        businessName: 'CBD Direct LLC',
        taxId: '85-4567890',
        licenseNumber: 'WHL-2024-004',
        licenseState: 'FL',
        contactName: 'Sarah Williams',
        contactEmail: 'sarah@cbddirect.com',
        contactPhone: '305-555-0404',
        address: '321 Hemp Lane',
        city: 'Miami',
        state: 'FL',
        zipCode: '33101',
        businessType: 'CBD & Hemp',
        paymentTerms: 'NET30',
        minimumOrderValue: 150,
        shippingMethods: ['UPS Ground'],
        status: 'ACTIVE',
        ratingAvg: 4.8,
        ratingCount: 45,
        isVerified: true,
      },
    }),
    prisma.wholesaler.create({
      data: {
        wholesalerId: 'WS005',
        name: 'Budget Smoke Supplies',
        businessName: 'Budget Smoke Supplies Corp',
        taxId: '86-5678901',
        licenseNumber: 'WHL-2024-005',
        licenseState: 'NY',
        contactName: 'Alex Kim',
        contactEmail: 'alex@budgetsmoke.com',
        contactPhone: '212-555-0505',
        address: '555 Value St',
        city: 'New York',
        state: 'NY',
        zipCode: '10001',
        businessType: 'Budget Wholesale',
        paymentTerms: 'NET30',
        minimumOrderValue: 25,
        shippingMethods: ['USPS Priority', 'UPS Ground'],
        status: 'ACTIVE',
        ratingAvg: 3.9,
        ratingCount: 210,
        isVerified: true,
      },
    }),
  ]);

  console.log(`✅ Created ${wholesalers.length} wholesalers`);

  // ─── RETAILERS ───
  const retailers = await Promise.all([
    prisma.retailer.create({
      data: {
        retailerId: 'RT001',
        name: 'Cloud 9 Smoke Shop',
        businessName: 'Cloud 9 Smoke Shop LLC',
        storeType: 'Smoke Shop',
        contactEmail: 'retailer@test.com',
        address: '100 Main St',
        city: 'Austin',
        state: 'TX',
        zipCode: '73301',
        latitude: 30.2672,
        longitude: -97.7431,
        creditLimit: 10000,
        paymentMethod: 'NET30',
        status: 'ACTIVE',
        lifetimeValue: 15420.50,
      },
    }),
    prisma.retailer.create({
      data: {
        retailerId: 'RT002',
        name: 'Quick Stop Gas & Smoke',
        businessName: 'Quick Stop Inc',
        storeType: 'Gas Station',
        contactEmail: 'quickstop@test.com',
        address: '200 Highway Rd',
        city: 'Houston',
        state: 'TX',
        zipCode: '77001',
        latitude: 29.7604,
        longitude: -95.3698,
        creditLimit: 5000,
        paymentMethod: 'CREDIT_CARD',
        status: 'ACTIVE',
        lifetimeValue: 8750.00,
      },
    }),
    prisma.retailer.create({
      data: {
        retailerId: 'RT003',
        name: 'Puff Palace',
        businessName: 'Puff Palace LLC',
        storeType: 'Smoke Shop',
        contactEmail: 'puff@test.com',
        address: '300 Vape Ln',
        city: 'Phoenix',
        state: 'AZ',
        zipCode: '85001',
        creditLimit: 15000,
        paymentMethod: 'NET30',
        status: 'ACTIVE',
        lifetimeValue: 22100.75,
      },
    }),
    prisma.retailer.create({
      data: {
        retailerId: 'RT004',
        name: 'Corner Convenience',
        businessName: 'Corner Convenience Store',
        storeType: 'Convenience Store',
        contactEmail: 'corner@test.com',
        address: '400 Elm Ave',
        city: 'Chicago',
        state: 'IL',
        zipCode: '60601',
        creditLimit: 3000,
        paymentMethod: 'CREDIT_CARD',
        status: 'ACTIVE',
        lifetimeValue: 4200.00,
      },
    }),
    prisma.retailer.create({
      data: {
        retailerId: 'RT005',
        name: 'Green Leaf Shop',
        businessName: 'Green Leaf Enterprises',
        storeType: 'Smoke Shop',
        contactEmail: 'greenleaf@test.com',
        address: '500 Oak Blvd',
        city: 'Portland',
        state: 'OR',
        zipCode: '97201',
        creditLimit: 8000,
        paymentMethod: 'ACH',
        status: 'ACTIVE',
        lifetimeValue: 11320.25,
      },
    }),
  ]);

  console.log(`✅ Created ${retailers.length} retailers`);

  // ─── CATEGORIES ───
  const categories = await Promise.all([
    prisma.category.create({ data: { categoryId: 'CAT001', name: 'Smoking Accessories', level: 1, displayOrder: 1, iconName: 'Cigarette', description: 'Glass pipes, bongs, hand pipes, silicone pipes' } }),
    prisma.category.create({ data: { categoryId: 'CAT002', name: 'Vape Products', level: 1, displayOrder: 2, iconName: 'Wind', description: 'Disposables, mods, e-liquids, cartridges' } }),
    prisma.category.create({ data: { categoryId: 'CAT003', name: 'Rolling Supplies', level: 1, displayOrder: 3, iconName: 'ScrollText', description: 'Papers, cones, blunt wraps, rolling machines' } }),
    prisma.category.create({ data: { categoryId: 'CAT004', name: 'Glassware', level: 1, displayOrder: 4, iconName: 'Beaker', description: 'Dab rigs, beakers, bubblers, percolators' } }),
    prisma.category.create({ data: { categoryId: 'CAT005', name: 'Accessories', level: 1, displayOrder: 5, iconName: 'Wrench', description: 'Grinders, lighters, torches, storage' } }),
    prisma.category.create({ data: { categoryId: 'CAT006', name: 'Maintenance', level: 1, displayOrder: 6, iconName: 'Sparkles', description: 'Cleaning solutions, pipe cleaners' } }),
    prisma.category.create({ data: { categoryId: 'CAT007', name: 'CBD Products', level: 1, displayOrder: 7, iconName: 'Leaf', description: 'Gummies, tinctures, Delta-8 cartridges' } }),
    prisma.category.create({ data: { categoryId: 'CAT008', name: 'Clothing', level: 1, displayOrder: 8, iconName: 'Shirt', description: 'Branded apparel, tie-dye, hemp accessories' } }),
    prisma.category.create({ data: { categoryId: 'CAT009', name: 'Novelty', level: 1, displayOrder: 9, iconName: 'PartyPopper', description: 'Lava lamps, posters, tapestries, incense' } }),
    prisma.category.create({ data: { categoryId: 'CAT010', name: 'Beverages', level: 1, displayOrder: 10, iconName: 'Coffee', description: 'Energy drinks, convenience store items' } }),
    prisma.category.create({ data: { categoryId: 'CAT011', name: 'Storage', level: 1, displayOrder: 11, iconName: 'Box', description: 'Smell-proof bags, stash containers' } }),
  ]);

  console.log(`✅ Created ${categories.length} categories`);

  // ─── PRODUCTS ───
  const products = await Promise.all([
    prisma.product.create({
      data: {
        productId: 'PRD001', sku: 'VAPE-DISP-001', upcCode: '012345678901',
        name: 'Cloud Burst Disposable Vape 5000 Puffs', description: 'Premium disposable vape with 5000 puff capacity. Available in multiple flavors.',
        brand: 'CloudBurst', manufacturer: 'CloudBurst Labs', categoryId: categories[1].id,
        subCategory: 'Disposable Vapes', flavor: 'Mixed Berry', nicotineStrength: '5%',
        unitOfMeasure: 'EACH', unitsPerCase: 10, weightLbs: 0.15,
        ageRestricted: true, minimumAge: 21, restrictedStates: ['UT', 'MA'],
        searchKeywords: 'disposable vape pod puff bar rechargeable', tags: ['bestseller', 'new'],
        status: 'ACTIVE',
      },
    }),
    prisma.product.create({
      data: {
        productId: 'PRD002', sku: 'GLASS-BONG-001', upcCode: '012345678902',
        name: 'Crystal Clear 12" Beaker Bong', description: 'High-quality borosilicate glass beaker bong with ice catcher and percolator.',
        brand: 'Crystal Clear', manufacturer: 'Crystal Glass Works', categoryId: categories[3].id,
        subCategory: 'Beaker Bongs', material: 'Borosilicate Glass', size: '12 inch',
        unitOfMeasure: 'EACH', unitsPerCase: 4, weightLbs: 2.5,
        ageRestricted: true, minimumAge: 21,
        searchKeywords: 'bong beaker glass water pipe percolator ice catcher',
        tags: ['premium', 'popular'], status: 'ACTIVE',
      },
    }),
    prisma.product.create({
      data: {
        productId: 'PRD003', sku: 'ROLL-CONE-001', upcCode: '012345678903',
        name: 'RAW Classic King Size Pre-Rolled Cones 32pk', description: 'Natural unrefined rolling cones. King size 110mm.',
        brand: 'RAW', manufacturer: 'RAW Rolling Papers', categoryId: categories[2].id,
        subCategory: 'Pre-Rolled Cones', size: 'King Size',
        unitOfMeasure: 'PACK', unitsPerCase: 24, weightLbs: 0.3,
        ageRestricted: true, minimumAge: 21,
        searchKeywords: 'raw cones rolling papers pre-rolled king size', tags: ['bestseller'],
        status: 'ACTIVE',
      },
    }),
    prisma.product.create({
      data: {
        productId: 'PRD004', sku: 'GRND-HERB-001', upcCode: '012345678904',
        name: 'SharpStone 4-Piece Herb Grinder 2.5"', description: 'Aircraft grade aluminum grinder with pollen catcher.',
        brand: 'SharpStone', manufacturer: 'SharpStone USA', categoryId: categories[4].id,
        subCategory: 'Grinders', material: 'Aircraft Aluminum', size: '2.5 inch', color: 'Black',
        unitOfMeasure: 'EACH', unitsPerCase: 12, weightLbs: 0.5,
        ageRestricted: true, minimumAge: 21,
        searchKeywords: 'grinder herb spice crusher aluminum 4-piece', tags: ['popular'],
        status: 'ACTIVE',
      },
    }),
    prisma.product.create({
      data: {
        productId: 'PRD005', sku: 'CBD-GUMMY-001', upcCode: '012345678905',
        name: 'Delta-8 THC Gummies 25mg 30ct', description: 'Premium Delta-8 THC gummies. 25mg per gummy, 30 count jar.',
        brand: 'HempLife', manufacturer: 'HempLife Naturals', categoryId: categories[6].id,
        subCategory: 'Delta-8 Gummies', flavor: 'Watermelon',
        unitOfMeasure: 'JAR', unitsPerCase: 12, weightLbs: 0.4,
        ageRestricted: true, minimumAge: 21, restrictedStates: ['CO', 'NY', 'VT'],
        searchKeywords: 'delta-8 gummies thc edibles hemp', tags: ['trending'],
        status: 'ACTIVE',
      },
    }),
    prisma.product.create({
      data: {
        productId: 'PRD006', sku: 'CLEAN-SOL-001', upcCode: '012345678906',
        name: 'Formula 420 Original Glass Cleaner 16oz', description: 'Fast-acting glass cleaner. Works on all types of glass pipes and bongs.',
        brand: 'Formula 420', manufacturer: 'Formula 420 Inc', categoryId: categories[5].id,
        subCategory: 'Glass Cleaners', size: '16 oz',
        unitOfMeasure: 'BOTTLE', unitsPerCase: 12, weightLbs: 1.2,
        ageRestricted: false, minimumAge: 18,
        searchKeywords: 'glass cleaner pipe bong cleaning solution formula 420',
        status: 'ACTIVE',
      },
    }),
    prisma.product.create({
      data: {
        productId: 'PRD007', sku: 'VAPE-MOD-001', upcCode: '012345678907',
        name: 'SMOK Nord 5 Pod System Kit', description: 'Compact pod system with adjustable airflow and 2000mAh battery.',
        brand: 'SMOK', manufacturer: 'SMOK Technology', categoryId: categories[1].id,
        subCategory: 'Pod Systems', color: 'Gunmetal',
        unitOfMeasure: 'EACH', unitsPerCase: 6, weightLbs: 0.3,
        ageRestricted: true, minimumAge: 21,
        searchKeywords: 'smok nord pod system vape kit mod refillable', tags: ['popular'],
        status: 'ACTIVE',
      },
    }),
    prisma.product.create({
      data: {
        productId: 'PRD008', sku: 'PIPE-HAND-001', upcCode: '012345678908',
        name: 'Fumed Glass Spoon Pipe 4.5"', description: 'Color-changing hand pipe with deep bowl and carb hole.',
        brand: 'ArtGlass', manufacturer: 'ArtGlass Studio', categoryId: categories[0].id,
        subCategory: 'Hand Pipes', material: 'Fumed Glass', size: '4.5 inch',
        unitOfMeasure: 'EACH', unitsPerCase: 24, weightLbs: 0.2,
        ageRestricted: true, minimumAge: 21,
        searchKeywords: 'hand pipe spoon glass fumed color changing bowl',
        status: 'ACTIVE',
      },
    }),
    prisma.product.create({
      data: {
        productId: 'PRD009', sku: 'TORCH-BTN-001', upcCode: '012345678909',
        name: 'Blazer Big Shot GT-8000 Torch', description: 'Industrial-quality butane torch. Brass nozzle, anti-flare ignition.',
        brand: 'Blazer', manufacturer: 'Blazer International', categoryId: categories[4].id,
        subCategory: 'Torches',
        unitOfMeasure: 'EACH', unitsPerCase: 6, weightLbs: 1.0,
        ageRestricted: true, minimumAge: 18,
        searchKeywords: 'torch butane blazer big shot dab lighter', tags: ['premium'],
        status: 'ACTIVE',
      },
    }),
    prisma.product.create({
      data: {
        productId: 'PRD010', sku: 'STOR-SMPR-001', upcCode: '012345678910',
        name: 'StashGuard Smell-Proof Bag Large', description: 'Activated carbon lined bag. Completely smell-proof with combination lock.',
        brand: 'StashGuard', manufacturer: 'StashGuard Products', categoryId: categories[10].id,
        subCategory: 'Smell-Proof Bags', size: 'Large', color: 'Black',
        unitOfMeasure: 'EACH', unitsPerCase: 20, weightLbs: 0.5,
        ageRestricted: false, minimumAge: 18,
        searchKeywords: 'smell proof bag stash storage lock travel', tags: ['new'],
        status: 'ACTIVE',
      },
    }),
  ]);

  console.log(`✅ Created ${products.length} products`);

  // ─── PRODUCT BARCODES ───
  await Promise.all(
    products.map((product) =>
      prisma.productBarcode.create({
        data: {
          productId: product.id,
          barcode: product.upcCode || `UPC${product.productId}`,
          barcodeType: 'UPC',
        },
      })
    )
  );

  console.log(`✅ Created ${products.length} product barcodes`);

  // ─── PRODUCT PRICINGS (multiple suppliers per product) ───
  const pricingData: { productIndex: number; wholesalerIndex: number; price: number; moq: number; stock: number; stockStatus: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK'; leadDays: number }[] = [
    // PRD001 - Cloud Burst Vape (4 suppliers)
    { productIndex: 0, wholesalerIndex: 0, price: 8.50, moq: 10, stock: 500, stockStatus: 'IN_STOCK', leadDays: 3 },
    { productIndex: 0, wholesalerIndex: 2, price: 7.99, moq: 25, stock: 200, stockStatus: 'IN_STOCK', leadDays: 5 },
    { productIndex: 0, wholesalerIndex: 4, price: 9.25, moq: 5, stock: 50, stockStatus: 'LOW_STOCK', leadDays: 7 },
    { productIndex: 0, wholesalerIndex: 3, price: 8.75, moq: 10, stock: 0, stockStatus: 'OUT_OF_STOCK', leadDays: 10 },
    // PRD002 - Crystal Bong (3 suppliers)
    { productIndex: 1, wholesalerIndex: 1, price: 24.99, moq: 4, stock: 80, stockStatus: 'IN_STOCK', leadDays: 5 },
    { productIndex: 1, wholesalerIndex: 0, price: 27.50, moq: 2, stock: 30, stockStatus: 'IN_STOCK', leadDays: 3 },
    { productIndex: 1, wholesalerIndex: 4, price: 29.99, moq: 1, stock: 15, stockStatus: 'LOW_STOCK', leadDays: 7 },
    // PRD003 - RAW Cones (3 suppliers)
    { productIndex: 2, wholesalerIndex: 2, price: 4.50, moq: 24, stock: 1000, stockStatus: 'IN_STOCK', leadDays: 2 },
    { productIndex: 2, wholesalerIndex: 4, price: 4.25, moq: 48, stock: 800, stockStatus: 'IN_STOCK', leadDays: 4 },
    { productIndex: 2, wholesalerIndex: 0, price: 4.99, moq: 12, stock: 300, stockStatus: 'IN_STOCK', leadDays: 3 },
    // PRD004 - Grinder (3 suppliers)
    { productIndex: 3, wholesalerIndex: 1, price: 12.99, moq: 6, stock: 150, stockStatus: 'IN_STOCK', leadDays: 4 },
    { productIndex: 3, wholesalerIndex: 2, price: 14.50, moq: 3, stock: 75, stockStatus: 'IN_STOCK', leadDays: 5 },
    { productIndex: 3, wholesalerIndex: 4, price: 11.50, moq: 12, stock: 200, stockStatus: 'IN_STOCK', leadDays: 6 },
    // PRD005 - CBD Gummies (2 suppliers)
    { productIndex: 4, wholesalerIndex: 3, price: 18.99, moq: 12, stock: 300, stockStatus: 'IN_STOCK', leadDays: 3 },
    { productIndex: 4, wholesalerIndex: 2, price: 21.50, moq: 6, stock: 100, stockStatus: 'IN_STOCK', leadDays: 5 },
    // PRD006 - Glass Cleaner (3 suppliers)
    { productIndex: 5, wholesalerIndex: 1, price: 5.99, moq: 12, stock: 500, stockStatus: 'IN_STOCK', leadDays: 3 },
    { productIndex: 5, wholesalerIndex: 2, price: 6.25, moq: 6, stock: 200, stockStatus: 'IN_STOCK', leadDays: 4 },
    { productIndex: 5, wholesalerIndex: 4, price: 5.75, moq: 24, stock: 400, stockStatus: 'IN_STOCK', leadDays: 5 },
    // PRD007 - SMOK Nord (2 suppliers)
    { productIndex: 6, wholesalerIndex: 0, price: 32.00, moq: 6, stock: 100, stockStatus: 'IN_STOCK', leadDays: 3 },
    { productIndex: 6, wholesalerIndex: 4, price: 34.50, moq: 3, stock: 40, stockStatus: 'LOW_STOCK', leadDays: 6 },
    // PRD008 - Hand Pipe (3 suppliers)
    { productIndex: 7, wholesalerIndex: 1, price: 6.50, moq: 12, stock: 300, stockStatus: 'IN_STOCK', leadDays: 4 },
    { productIndex: 7, wholesalerIndex: 2, price: 7.25, moq: 6, stock: 150, stockStatus: 'IN_STOCK', leadDays: 5 },
    { productIndex: 7, wholesalerIndex: 4, price: 5.99, moq: 24, stock: 500, stockStatus: 'IN_STOCK', leadDays: 7 },
    // PRD009 - Blazer Torch (2 suppliers)
    { productIndex: 8, wholesalerIndex: 0, price: 42.00, moq: 3, stock: 50, stockStatus: 'IN_STOCK', leadDays: 3 },
    { productIndex: 8, wholesalerIndex: 2, price: 44.99, moq: 2, stock: 30, stockStatus: 'IN_STOCK', leadDays: 5 },
    // PRD010 - Smell-Proof Bag (2 suppliers)
    { productIndex: 9, wholesalerIndex: 4, price: 8.99, moq: 10, stock: 200, stockStatus: 'IN_STOCK', leadDays: 4 },
    { productIndex: 9, wholesalerIndex: 2, price: 9.75, moq: 5, stock: 100, stockStatus: 'IN_STOCK', leadDays: 5 },
  ];

  await Promise.all(
    pricingData.map((p) =>
      prisma.productPricing.create({
        data: {
          productId: products[p.productIndex].id,
          wholesalerId: wholesalers[p.wholesalerIndex].id,
          wholesalePrice: p.price,
          msrp: p.price * 2.2,
          minimumOrderQty: p.moq,
          caseQty: products[p.productIndex].unitsPerCase || undefined,
          stockQuantity: p.stock,
          stockStatus: p.stockStatus,
          leadTimeDays: p.leadDays,
          isActive: true,
        },
      })
    )
  );

  console.log(`✅ Created ${pricingData.length} product pricings`);

  // ─── PRICE HISTORY (90 days) ───
  const priceHistoryEntries = [];
  for (const p of pricingData.slice(0, 10)) {
    const basePrice = p.price;
    for (let daysAgo = 90; daysAgo >= 0; daysAgo -= 7) {
      const date = new Date();
      date.setDate(date.getDate() - daysAgo);
      const variation = (Math.random() - 0.5) * basePrice * 0.15;
      const historicalPrice = Math.round((basePrice + variation) * 100) / 100;

      priceHistoryEntries.push({
        productId: products[p.productIndex].id,
        wholesalerId: wholesalers[p.wholesalerIndex].id,
        effectiveDate: date,
        wholesalePrice: historicalPrice,
        previousPrice: historicalPrice + variation * 0.5,
        priceChangeAmount: Math.round(variation * 100) / 100,
        priceChangePercent: Math.round((variation / basePrice) * 10000) / 100,
        changeReason: variation > 0 ? 'COST_INCREASE' as const : 'COMPETITIVE' as const,
      });
    }
  }

  await prisma.priceHistory.createMany({ data: priceHistoryEntries });
  console.log(`✅ Created ${priceHistoryEntries.length} price history records`);

  // ─── USERS ───
  const passwordHash = await bcrypt.hash('Password123!', 12);

  await Promise.all([
    prisma.user.create({
      data: {
        email: 'admin@test.com', passwordHash,
        role: 'ADMIN', status: 'ACTIVE',
        firstName: 'Sarah', lastName: 'Admin',
        ageVerified: true,
      },
    }),
    prisma.user.create({
      data: {
        email: 'retailer@test.com', passwordHash,
        role: 'RETAILER', status: 'ACTIVE',
        firstName: 'Maria', lastName: 'Lopez',
        ageVerified: true,
        retailerId: retailers[0].id,
      },
    }),
    prisma.user.create({
      data: {
        email: 'wholesaler@test.com', passwordHash,
        role: 'WHOLESALER', status: 'ACTIVE',
        firstName: 'James', lastName: 'Rodriguez',
        ageVerified: true,
        wholesalerId: wholesalers[0].id,
      },
    }),
    prisma.user.create({
      data: {
        email: 'warehouse@test.com', passwordHash,
        role: 'WAREHOUSE_STAFF', status: 'ACTIVE',
        firstName: 'Carlos', lastName: 'Mendez',
        ageVerified: true,
      },
    }),
    prisma.user.create({
      data: {
        email: 'analyst@test.com', passwordHash,
        role: 'ANALYST', status: 'ACTIVE',
        firstName: 'Dana', lastName: 'Singh',
        ageVerified: true,
      },
    }),
  ]);

  console.log('✅ Created 5 demo users');

  // ─── SAMPLE ORDERS ───
  const retailerUser = await prisma.user.findUnique({ where: { email: 'retailer@test.com' } });

  const orderData = [
    { wsIdx: 0, status: 'DELIVERED' as const, days: 15, items: [{ pIdx: 0, qty: 20, price: 8.50 }, { pIdx: 6, qty: 6, price: 32.00 }] },
    { wsIdx: 1, status: 'SHIPPED' as const, days: 5, items: [{ pIdx: 1, qty: 4, price: 24.99 }, { pIdx: 7, qty: 12, price: 6.50 }] },
    { wsIdx: 2, status: 'CONFIRMED' as const, days: 2, items: [{ pIdx: 2, qty: 48, price: 4.50 }] },
    { wsIdx: 4, status: 'PENDING' as const, days: 0, items: [{ pIdx: 3, qty: 12, price: 11.50 }, { pIdx: 9, qty: 10, price: 8.99 }] },
    { wsIdx: 3, status: 'CANCELLED' as const, days: 10, items: [{ pIdx: 4, qty: 12, price: 18.99 }] },
  ];

  for (const od of orderData) {
    const orderDate = new Date();
    orderDate.setDate(orderDate.getDate() - od.days);
    const subtotal = od.items.reduce((s, i) => s + i.price * i.qty, 0);
    const tax = Math.round(subtotal * 0.0825 * 100) / 100;
    const total = Math.round((subtotal + tax) * 100) / 100;

    await prisma.order.create({
      data: {
        orderNumber: `ORD-DEMO-${String(orderData.indexOf(od) + 1).padStart(3, '0')}`,
        retailerId: retailers[0].id,
        wholesalerId: wholesalers[od.wsIdx].id,
        userId: retailerUser!.id,
        orderStatus: od.status,
        paymentStatus: od.status === 'DELIVERED' ? 'PAID' : od.status === 'CANCELLED' ? 'REFUNDED' : 'PENDING',
        paymentMethod: 'NET30',
        orderDate,
        subtotalAmount: subtotal,
        taxAmount: tax,
        totalAmount: total,
        shipToAddress: '100 Main St',
        shipToCity: 'Austin',
        shipToState: 'TX',
        shipToZip: '73301',
        totalItems: od.items.length,
        totalUnits: od.items.reduce((s, i) => s + i.qty, 0),
        trackingNumber: od.status === 'SHIPPED' || od.status === 'DELIVERED' ? '1Z999AA10123456784' : undefined,
        shippingCarrier: od.status === 'SHIPPED' || od.status === 'DELIVERED' ? 'UPS' : undefined,
        lines: {
          create: od.items.map((item, idx) => ({
            lineNumber: idx + 1,
            productId: products[item.pIdx].id,
            sku: products[item.pIdx].sku,
            productName: products[item.pIdx].name,
            quantityOrdered: item.qty,
            quantityShipped: od.status === 'DELIVERED' ? item.qty : od.status === 'SHIPPED' ? item.qty : 0,
            unitPrice: item.price,
            lineSubtotal: item.price * item.qty,
            lineTax: Math.round(item.price * item.qty * 0.0825 * 100) / 100,
            lineTotal: Math.round(item.price * item.qty * 1.0825 * 100) / 100,
            lineStatus: od.status === 'DELIVERED' ? 'SHIPPED' as const : od.status === 'CANCELLED' ? 'CANCELLED' as const : 'PENDING' as const,
          })),
        },
      },
    });
  }

  console.log(`✅ Created ${orderData.length} sample orders`);

  // ─── SAMPLE RECEIPTS ───
  const receiptData = [
    { supplier: 'WS001', status: 'FULLY_RECEIVED' as const, lines: [{ pIdx: 0, expected: 100, received: 100 }, { pIdx: 6, expected: 20, received: 18 }] },
    { supplier: 'WS002', status: 'PARTIAL_RECEIVED' as const, lines: [{ pIdx: 1, expected: 20, received: 12 }, { pIdx: 7, expected: 50, received: 50 }] },
    { supplier: 'WS003', status: 'AWAITING_ARRIVAL' as const, lines: [{ pIdx: 2, expected: 200, received: 0 }, { pIdx: 3, expected: 30, received: 0 }] },
  ];

  for (const rd of receiptData) {
    const totalExpected = rd.lines.reduce((s, l) => s + l.expected, 0);
    const totalReceived = rd.lines.reduce((s, l) => s + l.received, 0);

    await prisma.inventoryReceipt.create({
      data: {
        receiptNumber: `RCP-DEMO-${String(receiptData.indexOf(rd) + 1).padStart(3, '0')}`,
        supplierId: rd.supplier,
        poNumber: `PO-${rd.supplier}-001`,
        documentType: 'ASN',
        sourceChannel: 'API_WEBHOOK',
        carrier: 'UPS',
        status: rd.status,
        totalLinesExpected: rd.lines.length,
        totalLinesReceived: rd.lines.filter((l) => l.received > 0).length,
        totalQtyExpected: totalExpected,
        totalQtyReceived: totalReceived,
        discrepancyCount: rd.lines.filter((l) => l.received !== l.expected && l.received > 0).length,
        lines: {
          create: rd.lines.map((line, idx) => ({
            lineNumber: idx + 1,
            productId: products[line.pIdx].id,
            sku: products[line.pIdx].sku,
            productName: products[line.pIdx].name,
            qtyExpected: line.expected,
            qtyReceived: line.received,
            condition: line.received > 0 ? 'GOOD' as const : 'PENDING' as const,
            lineStatus: line.received === 0 ? 'PENDING' as const : line.received >= line.expected ? 'RECEIVED' as const : 'SHORT' as const,
          })),
        },
      },
    });
  }

  console.log(`✅ Created ${receiptData.length} sample receipts`);

  // ─── INVENTORY ON HAND ───
  await Promise.all(
    products.map((product, idx) =>
      prisma.inventoryOnHand.create({
        data: {
          productId: product.id,
          quantityOnHand: [500, 80, 1000, 200, 300, 500, 120, 400, 50, 200][idx] || 100,
          quantityReserved: [20, 5, 50, 10, 15, 20, 8, 15, 3, 10][idx] || 5,
          quantityAvailable: [480, 75, 950, 190, 285, 480, 112, 385, 47, 190][idx] || 95,
          reorderPoint: [100, 20, 200, 50, 50, 100, 30, 80, 10, 50][idx] || 25,
          averageCost: pricingData.find((p) => p.productIndex === idx)?.price || 10,
        },
      })
    )
  );

  console.log(`✅ Created ${products.length} inventory on-hand records`);

  // ─── ENTERPRISE SEED DATA ───

  // Prompt Templates
  await Promise.all([
    prisma.promptTemplate.create({
      data: {
        name: 'DOCUMENT_CLASSIFICATION',
        version: '1.0.0',
        systemPrompt: 'You are a document classifier for a wholesale marketplace. Classify the document type.',
        userPromptTemplate: 'Classify this document:\n\n{{documentText}}\n\nReturn JSON: { "type": "INVOICE" | "ASN" | "PO_CONFIRMATION" | "UNKNOWN", "confidence": 0.0-1.0 }',
        model: 'anthropic.claude-3-sonnet-20240229-v1:0',
        temperature: 0,
        maxTokens: 256,
        tags: ['extraction', 'classification'],
        isActive: true,
        isDefault: true,
        createdBy: 'SYSTEM',
      },
    }),
    prisma.promptTemplate.create({
      data: {
        name: 'RECEIPT_EXTRACTION',
        version: '1.0.0',
        systemPrompt: 'You are a document extraction system for a wholesale marketplace. Extract structured data from supplier documents. Return ONLY valid JSON.',
        userPromptTemplate: 'Extract data from this document:\n\n{{documentText}}\n\nReturn JSON matching the ReceiptExtraction schema.',
        model: 'anthropic.claude-3-sonnet-20240229-v1:0',
        temperature: 0,
        maxTokens: 4096,
        tags: ['extraction', 'receipt'],
        isActive: true,
        isDefault: true,
        createdBy: 'SYSTEM',
      },
    }),
  ]);
  console.log('✅ Created prompt templates');

  // Threshold Configs
  await Promise.all([
    prisma.thresholdConfig.create({
      data: { metricName: 'anomaly_zscore', currentValue: 2.0, minValue: 1.0, maxValue: 4.0 },
    }),
    prisma.thresholdConfig.create({
      data: { metricName: 'extraction_confidence', currentValue: 0.7, minValue: 0.5, maxValue: 0.95 },
    }),
    prisma.thresholdConfig.create({
      data: { metricName: 'price_change_percent', currentValue: 0.2, minValue: 0.05, maxValue: 0.5 },
    }),
  ]);
  console.log('✅ Created threshold configs');

  // Sample Notifications for retailer user
  const retailerUser = users.find((u) => u.email === 'retailer@test.com');
  if (retailerUser) {
    await Promise.all([
      prisma.notification.create({
        data: {
          userId: retailerUser.id,
          type: 'ORDER_UPDATE',
          title: 'Order Shipped',
          message: 'Your order ORD-2024-001 from Premium Vape Distributors has been shipped via UPS Ground. Tracking: 1Z999AA10123456784',
          isRead: false,
          actionUrl: '/orders',
        },
      }),
      prisma.notification.create({
        data: {
          userId: retailerUser.id,
          type: 'PRICE_ALERT',
          title: 'Price Drop Alert',
          message: 'CloudPuff Max Disposable Vape price dropped 12% at Glass Warehouse Supply — now $7.99/unit.',
          isRead: false,
          actionUrl: '/marketplace',
        },
      }),
      prisma.notification.create({
        data: {
          userId: retailerUser.id,
          type: 'STOCK_ALERT',
          title: 'Low Stock Warning',
          message: 'RAW Classic King Size Cones (PRD003) are running low at Budget Smoke Supply — only 45 units left.',
          isRead: true,
          actionUrl: '/marketplace',
        },
      }),
      prisma.notification.create({
        data: {
          userId: retailerUser.id,
          type: 'SYSTEM',
          title: 'Welcome to WholesaleHub',
          message: 'Your account has been set up. Start browsing the marketplace to find the best wholesale prices for your store.',
          isRead: true,
          actionUrl: '/marketplace',
        },
      }),
      prisma.notification.create({
        data: {
          userId: retailerUser.id,
          type: 'ORDER_UPDATE',
          title: 'Order Delivered',
          message: 'Your order ORD-2024-002 has been delivered. Please confirm receipt and check the items.',
          isRead: false,
          actionUrl: '/orders',
        },
      }),
    ]);
    console.log('✅ Created sample notifications');
  }

  // Sample Document Extractions
  await Promise.all([
    prisma.documentExtraction.create({
      data: {
        documentName: 'Invoice-WS001-2024-156.pdf',
        documentText: 'Premium Vape Distributors\nInvoice #INV-2024-156\nPO: PO-2024-089\n\nItem: CloudPuff Max Disposable Vape\nQty: 100\nUnit Price: $8.50\nTotal: $850.00\n\nSubtotal: $850.00\nTax: $70.13\nTotal: $920.13',
        extractedData: {
          supplier_name: 'Premium Vape Distributors',
          document_type: 'INVOICE',
          document_number: 'INV-2024-156',
          po_reference: 'PO-2024-089',
          line_items: [{ sku: 'VAPE-CLOUD-001', product_description: 'CloudPuff Max Disposable Vape', quantity: 100, unit_cost: 8.50, line_total: 850.00 }],
          subtotal: 850.00,
          tax: 70.13,
          total: 920.13,
        },
        confidence: { supplier_name: 'HIGH', line_items: 'HIGH', totals: 'HIGH' },
        status: 'AUTO_ACCEPTED',
        attempts: 1,
      },
    }),
    prisma.documentExtraction.create({
      data: {
        documentName: 'ASN-WS003-2024-042.pdf',
        documentText: 'Smoker Essentials Inc\nAdvance Shipment Notice\nDoc: ASN-042\nPO: PO-2024-102\nCarrier: FedEx\nTracking: 7489532946\n\nItem 1: RAW Classic Cones\nQty: 200\nCost: $2.75\n\nItem 2: SharpStone Grinder\nQty: 50\nCost: $6.25',
        extractedData: {
          supplier_name: 'Smoker Essentials',
          document_type: 'ASN',
          document_number: 'ASN-042',
          po_reference: 'PO-2024-102',
          carrier: 'FedEx',
          tracking_number: '7489532946',
          line_items: [
            { sku: 'ROLL-RAW-001', product_description: 'RAW Classic Cones', quantity: 200, unit_cost: 2.75, line_total: 550.00 },
            { sku: 'ACC-SHARP-001', product_description: 'SharpStone Grinder', quantity: 50, unit_cost: 6.25, line_total: 312.50 },
          ],
          subtotal: 862.50,
          tax: null,
          total: 862.50,
        },
        confidence: { supplier_name: 'MEDIUM', line_items: 'HIGH', totals: 'MEDIUM' },
        status: 'PENDING_REVIEW',
        attempts: 2,
      },
    }),
  ]);
  console.log('✅ Created sample document extractions');

  // Sample Anomaly Records
  await Promise.all([
    prisma.anomalyRecord.create({
      data: {
        type: 'PRICING_ZSCORE',
        severity: 'HIGH',
        entityType: 'PRODUCT_PRICING',
        entityId: 'pricing-sample-1',
        description: 'CloudPuff Max Disposable Vape priced at $12.50 by CBD Direct Wholesale — 2.8 standard deviations above mean ($8.72). This is 43% higher than the average supplier price.',
        metadata: { productName: 'CloudPuff Max Disposable Vape', wholesalerName: 'CBD Direct Wholesale', currentPrice: 12.50, meanPrice: 8.72, zScore: 2.8 },
      },
    }),
    prisma.anomalyRecord.create({
      data: {
        type: 'LARGE_ORDER',
        severity: 'MEDIUM',
        entityType: 'ORDER',
        entityId: 'order-sample-1',
        description: 'Order from Quick Stop Gas & Snack totaling $4,250 — 2.3x their average order value of $1,847. This is an unusual spike in order size.',
        metadata: { retailerName: 'Quick Stop Gas & Snack', orderValue: 4250, avgOrderValue: 1847, ratio: 2.3 },
      },
    }),
    prisma.anomalyRecord.create({
      data: {
        type: 'LOW_STOCK',
        severity: 'HIGH',
        entityType: 'INVENTORY',
        entityId: 'inventory-sample-1',
        description: 'BudgetTorch Jet Lighter (PRD009) stock at 47 units — below reorder point of 50. No receipt in the last 60 days.',
        metadata: { productName: 'BudgetTorch Jet Lighter', quantityOnHand: 47, reorderPoint: 50, daysSinceReceipt: 60 },
      },
    }),
  ]);
  console.log('✅ Created sample anomaly records');

  // Sample Audit Events
  await Promise.all([
    prisma.auditEvent.create({
      data: {
        actorId: retailerUser?.id || 'SYSTEM',
        actorType: 'USER',
        action: 'CREATE',
        entityType: 'ORDER',
        entityId: 'order-audit-1',
        newState: { orderNumber: 'ORD-2024-001', status: 'PENDING', total: 850.00 },
        changedFields: ['orderNumber', 'status', 'total'],
        traceId: 'trace-001',
      },
    }),
    prisma.auditEvent.create({
      data: {
        actorId: 'SYSTEM',
        actorType: 'SYSTEM',
        action: 'STATUS_CHANGE',
        entityType: 'ORDER',
        entityId: 'order-audit-1',
        previousState: { status: 'PENDING' },
        newState: { status: 'CONFIRMED' },
        changedFields: ['status'],
        reason: 'Wholesaler confirmed order',
        traceId: 'trace-001',
      },
    }),
    prisma.auditEvent.create({
      data: {
        actorId: 'WEBHOOK:WS001',
        actorType: 'WEBHOOK',
        action: 'CREATE',
        entityType: 'RECEIPT',
        entityId: 'receipt-audit-1',
        newState: { receiptNumber: 'RCV-2024-001', status: 'AWAITING_ARRIVAL', lines: 5 },
        changedFields: ['receiptNumber', 'status'],
        traceId: 'trace-002',
      },
    }),
    prisma.auditEvent.create({
      data: {
        actorId: retailerUser?.id || 'SYSTEM',
        actorType: 'USER',
        action: 'LOGIN',
        entityType: 'USER',
        entityId: retailerUser?.id || 'user-audit-1',
        metadata: { ip: '192.168.1.100', userAgent: 'Mozilla/5.0' },
        changedFields: [],
      },
    }),
    prisma.auditEvent.create({
      data: {
        actorId: 'SYSTEM',
        actorType: 'SYSTEM',
        action: 'UPDATE',
        entityType: 'PRICING',
        entityId: 'pricing-audit-1',
        previousState: { wholesalePrice: 9.25, stockQuantity: 200 },
        newState: { wholesalePrice: 8.99, stockQuantity: 180 },
        changedFields: ['wholesalePrice', 'stockQuantity'],
        reason: 'Competitive price adjustment',
        traceId: 'trace-003',
      },
    }),
  ]);
  console.log('✅ Created sample audit events');

  // Sample Data Lineage
  const parentLineage = await prisma.dataLineage.create({
    data: {
      entityType: 'RECEIPT',
      entityId: 'lineage-receipt-1',
      sourceType: 'DOCUMENT',
      sourceId: 'doc-001',
      sourceUrl: '/uploads/Invoice-WS001-2024-156.pdf',
      transformationType: 'CREATED',
      evidenceType: 'ORIGINAL_DOCUMENT',
      evidenceUrl: '/uploads/Invoice-WS001-2024-156.pdf',
      evidenceHash: 'sha256:abc123def456',
      createdBy: 'AI:bedrock-claude-3',
    },
  });

  await prisma.dataLineage.create({
    data: {
      entityType: 'RECEIPT',
      entityId: 'lineage-receipt-1',
      sourceType: 'AI_EXTRACTION',
      sourceId: parentLineage.id,
      transformationType: 'EXTRACTED',
      transformationDetails: { model: 'anthropic.claude-3-sonnet', confidence: 0.95, attempts: 1 },
      parentLineageId: parentLineage.id,
      createdBy: 'AI:bedrock-claude-3',
    },
  });

  await prisma.dataLineage.create({
    data: {
      entityType: 'RECEIPT',
      entityId: 'lineage-receipt-1',
      sourceType: 'MANUAL_ENTRY',
      sourceId: retailerUser?.id || 'user-1',
      transformationType: 'CORRECTED',
      transformationDetails: { field: 'quantity', original_value: 100, corrected_value: 95, reason: 'AI misread quantity' },
      parentLineageId: parentLineage.id,
      createdBy: retailerUser?.id || 'user-1',
    },
  });
  console.log('✅ Created sample data lineage records');

  console.log('\n🎉 Database seeded successfully!');
  console.log('\n📋 Demo accounts:');
  console.log('  admin@test.com / Password123!');
  console.log('  retailer@test.com / Password123!');
  console.log('  wholesaler@test.com / Password123!');
  console.log('  warehouse@test.com / Password123!');
  console.log('  analyst@test.com / Password123!');
  console.log('\n🏢 Enterprise features seeded:');
  console.log('  2 prompt templates, 3 threshold configs');
  console.log('  5 notifications, 2 document extractions');
  console.log('  3 anomaly records, 5 audit events, 3 lineage records');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
