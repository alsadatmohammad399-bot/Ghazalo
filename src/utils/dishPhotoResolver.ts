export const STUDIO_FOOD_ASSETS = {
  kebabKofta: '/src/assets/images/dish_kebab_kofta_1795092513923.jpg',
  lambChops: '/src/assets/images/dish_lamb_chops_1795092514353.jpg',
  liverSausage: '/src/assets/images/dish_liver_sausage_1795092514076.jpg',
  vineLeaves: '/src/assets/images/dish_vine_leaves_1795092514241.jpg',
  okraMolokhia: '/src/assets/images/dish_okra_molokhia_1795092514978.jpg',
  bechamelPasta: '/src/assets/images/dish_bechamel_pasta_1795092515180.jpg',
  roastedChicken: '/src/assets/images/dish_roasted_chicken_1795092513804.jpg',
  icedLatte: '/src/assets/images/dish_iced_latte_1795092514007.jpg',
  turkishCoffee: '/src/assets/images/dish_turkish_coffee_1795092513637.jpg',
  croissantCake: '/src/assets/images/dish_croissant_cake_1795092514036.jpg',
  cheeseBurger: '/src/assets/images/dish_cheese_burger_1795092514624.jpg',
  caesarSalad: '/src/assets/images/dish_caesar_salad_1795092514020.jpg',
  mintMojito: '/src/assets/images/dish_mint_mojito_1795092514106.jpg',
  freshProduce: '/src/assets/images/prod_fresh_produce_1795092513593.jpg',
  groceryDairy: '/src/assets/images/prod_grocery_dairy_1795092514366.jpg',
  butcherMeat: '/src/assets/images/prod_butcher_meat_1795092514349.jpg',
  homeRepair: '/src/assets/images/srv_home_repair_1795092514795.jpg',
} as const;

export function resolveDishPhotoClient(name: string, category = ''): string {
  const txt = `${name} ${category}`.toLowerCase();

  // Services / Home maintenance
  if (/تكييف|سباكة|تنظيف|صيانة|كهرباء|نجارة|خدم|repair|clean|plumb|ac/.test(txt)) {
    return STUDIO_FOOD_ASSETS.homeRepair;
  }
  // Butcher / Raw meat cuts
  if (/جزارة|كندوز|انتركوت|قطعيات|جاهزة للشوي|مفروم|نيئ|butcher|raw/.test(txt)) {
    return STUDIO_FOOD_ASSETS.butcherMeat;
  }
  // Supermarket / Groceries / Dairy
  if (/زيت زيتون|حليب|لبن|جبنة|ألبان|بقالة|مكرونة إيطالي|milk|oil|feta|grocery/.test(txt)) {
    return STUDIO_FOOD_ASSETS.groceryDairy;
  }
  // Fresh produce
  if (/طماطم|خيار|رمان|ليمون|خضار|فواكه|خضروات|بطاطس طازجة|بصل|produce|fruit|vegetable/.test(txt)) {
    return STUDIO_FOOD_ASSETS.freshProduce;
  }
  // Drinks: iced / mojito / cold juice
  if (/موهيتو|ليمون|عصير|سموزي|مانجو|فراولة|برتقال|مياة|مياه|ساقع|بيبسي|كولا|mojito|juice|soda|cola|water/.test(txt)) {
    return STUDIO_FOOD_ASSETS.mintMojito;
  }
  if (/سبانيش|لاتيه مثلج|آيس كوفي|فرابتشينو|iced|latte|cold brew/.test(txt)) {
    return STUDIO_FOOD_ASSETS.icedLatte;
  }
  if (/قهوة|قهوه|شاي|نعناع|اسبريسو|تركي|كركديه|ينسون|مشروبات ساخنة|coffee|tea|espresso/.test(txt)) {
    return STUDIO_FOOD_ASSETS.turkishCoffee;
  }
  // Bakery & Desserts
  if (/كرواسون|مولتن|كيك|تورتة|حلويات|حلو|كنافة|بسبوسة|وافل|مخبوزات|croissant|cake|dessert|pastry/.test(txt)) {
    return STUDIO_FOOD_ASSETS.croissantCake;
  }
  // Burgers, Pizza & Sandwiches
  if (/برجر|شيز|تشيز|بطاطس|فرايز|pizza|بيتزا|burger|fries/.test(txt)) {
    return STUDIO_FOOD_ASSETS.cheeseBurger;
  }
  // Salads & Soups
  if (/سلطة|سيزر|تبولة|فتوش|شوربة|salad|caesar|soup/.test(txt)) {
    return STUDIO_FOOD_ASSETS.caesarSalad;
  }
  // Liver & Sausage
  if (/كبدة|سجق|مقانق|liver|sausage|sujuk/.test(txt)) {
    return STUDIO_FOOD_ASSETS.liverSausage;
  }
  // Stuffed vine leaves
  if (/ورق عنب|محشي|كوسة|ممبار|vine leaves|dolma/.test(txt)) {
    return STUDIO_FOOD_ASSETS.vineLeaves;
  }
  // Okra & Molokhia tagines
  if (/بامية|ملوخية|طاجن|طواجن|مسقعة|bamia|okra|molokhia|tagine/.test(txt)) {
    return STUDIO_FOOD_ASSETS.okraMolokhia;
  }
  // Bechamel & Pasta
  if (/بشاميل|مكرونة|باستا|اسباجتي|لازانيا|pasta|bechamel|lasagna/.test(txt)) {
    return STUDIO_FOOD_ASSETS.bechamelPasta;
  }
  // Chicken & Rice
  if (/فراخ|دجاج|فرخة|شيش|بانيه|بروست|مندي|كبسة|chicken|rice/.test(txt)) {
    return STUDIO_FOOD_ASSETS.roastedChicken;
  }
  // Lamb Chops
  if (/ريش|ضاني|ستيك|لحم|نيفا|chops|lamb|steak/.test(txt)) {
    return STUDIO_FOOD_ASSETS.lambChops;
  }
  // Default Grill (Kebab / Kofta / Mashawy)
  return STUDIO_FOOD_ASSETS.kebabKofta;
}
