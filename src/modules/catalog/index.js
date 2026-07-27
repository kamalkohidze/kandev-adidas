import { createInventoryRepository } from "./inventory/repository.js";
import { createInventoryService } from "./inventory/service.js";
import { createPriceRepository } from "./prices/repository.js";
import { createPriceService } from "./prices/service.js";
import { createProductRepository } from "./products/repository.js";
import { createProductService } from "./products/service.js";
import { createVariantRepository } from "./variants/repository.js";
import { createVariantService } from "./variants/service.js";

export function createCatalogServices(data) {
  const productRepository = createProductRepository(data);
  const variantRepository = createVariantRepository(data, productRepository);
  const priceRepository = createPriceRepository(data, variantRepository);
  const inventoryRepository = createInventoryRepository(data, variantRepository);

  return {
    products: createProductService(data, productRepository),
    variants: createVariantService(data, variantRepository),
    prices: createPriceService(data, priceRepository),
    inventory: createInventoryService(data, inventoryRepository),
    repositories: {
      products: productRepository,
      variants: variantRepository,
      prices: priceRepository,
      inventory: inventoryRepository
    }
  };
}

export { createInventoryRepository, createInventoryService } from "./inventory/index.js";
export { createPriceRepository, createPriceService } from "./prices/index.js";
export { createProductRepository, createProductService } from "./products/index.js";
export { createVariantRepository, createVariantService } from "./variants/index.js";
